#!/usr/bin/env python3
"""
Automated Media Processing Engine
=================================
Pipeline execution steps:
1. Ingest input parameters (TMDB_ID, SOURCE_URL) from environment or GitHub event.
2. Download high-bandwidth source media using yt-dlp with aria2c multi-connection acceleration.
3. Transcode/compress source stream to high-efficiency H.265 (HEVC) MP4 under 2GB.
4. Upload encoded file to Telegram Channel ID (-1004408587176).
5. Extract Telegram file_id and generate direct stream/message reference.
6. Retrieve TMDb metadata (Title, Overview, Poster Path, Release Date) via TMDb API v3.
7. Perform atomic UPSERT to Supabase table 'movies':
   - If exists: Append stream link to 'servers' array & update 'download_url'.
   - If not exists: Insert complete movie record.
8. Clean up local disk artifacts.
"""

import os
import sys
import json
import math
import shutil
import logging
import subprocess
from datetime import datetime
from pathlib import Path
import requests

try:
    from supabase import create_client, Client
except ImportError:
    Client = None
    create_client = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("MediaEngine")

# Maximum payload size targeted for Telegram (1.90 GB to ensure strict < 2GB constraint)
MAX_TARGET_BYTES = int(1.90 * 1024 * 1024 * 1024)
TARGET_AUDIO_BITRATE_K = 128


def load_input_parameters():
    """Extract tmdb_id and source_url from environment or github event json."""
    tmdb_id = os.environ.get("TMDB_ID")
    source_url = os.environ.get("SOURCE_URL")

    # If missing, attempt reading from GITHUB_EVENT_PATH (repository_dispatch)
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if event_path and Path(event_path).exists():
        try:
            with open(event_path, "r", encoding="utf-8") as f:
                event_data = json.load(f)
            client_payload = event_data.get("client_payload", {})
            if not tmdb_id and "tmdb_id" in client_payload:
                tmdb_id = str(client_payload["tmdb_id"]).strip()
            if not source_url and "source_url" in client_payload:
                source_url = str(client_payload["source_url"]).strip()

            # Also check workflow_dispatch inputs
            workflow_inputs = event_data.get("inputs", {})
            if not tmdb_id and "tmdb_id" in workflow_inputs:
                tmdb_id = str(workflow_inputs["tmdb_id"]).strip()
            if not source_url and "source_url" in workflow_inputs:
                source_url = str(workflow_inputs["source_url"]).strip()
        except Exception as e:
            logger.warning(f"Failed to parse GITHUB_EVENT_PATH: {e}")

    # Fallback to CLI args
    if not tmdb_id and len(sys.argv) > 1:
        tmdb_id = sys.argv[1].strip()
    if not source_url and len(sys.argv) > 2:
        source_url = sys.argv[2].strip()

    if not tmdb_id or not source_url:
        logger.error("Missing required parameters: TMDB_ID and SOURCE_URL must be provided.")
        sys.exit(1)

    return tmdb_id, source_url


def get_media_duration_seconds(file_path: str) -> float:
    """Probe video duration in seconds using ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        file_path
    ]
    try:
        output = subprocess.check_output(cmd, stderr=subprocess.STDOUT).decode().strip()
        return float(output)
    except Exception as e:
        logger.warning(f"Could not probe duration with ffprobe ({e}). Falling back to default.")
        return 0.0


def download_media(source_url: str, output_dir: Path) -> Path:
    """
    Download video from source_url with maximum speed using yt-dlp and aria2c.
    Falls back to direct aria2c or streaming requests if yt-dlp encounters issues.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    raw_template = str(output_dir / "input_media.%(ext)s")
    logger.info(f"Downloading source video from: {source_url}")

    has_aria2c = shutil.which("aria2c") is not None
    ytdlp_cmd = [
        "yt-dlp",
        "--no-check-certificates",
        "--no-playlist",
        "--concurrent-fragments", "16",
        "-o", raw_template
    ]

    if has_aria2c:
        logger.info("aria2c detected: enabling 16-connection acceleration.")
        ytdlp_cmd.extend([
            "--downloader", "aria2c",
            "--downloader-args", "aria2c:-x 16 -s 16 -k 1M --file-allocation=none"
        ])
    ytdlp_cmd.append(source_url)

    try:
        subprocess.run(ytdlp_cmd, check=True)
    except subprocess.CalledProcessError as err:
        logger.warning(f"yt-dlp exited with error ({err}). Trying direct aria2c / requests fallback.")
        direct_out = output_dir / "input_media.mp4"
        if has_aria2c:
            aria_cmd = ["aria2c", "-x", "16", "-s", "16", "-o", "input_media.mp4", "-d", str(output_dir), source_url]
            subprocess.run(aria_cmd, check=True)
        else:
            with requests.get(source_url, stream=True, timeout=60) as r:
                r.raise_for_status()
                with open(direct_out, "wb") as f:
                    for chunk in r.iter_content(chunk_size=1024 * 1024):
                        if chunk:
                            f.write(chunk)

    # Locate downloaded file
    matching_files = list(output_dir.glob("input_media.*"))
    if not matching_files:
        raise FileNotFoundError("Failed to locate downloaded media file.")

    downloaded = matching_files[0]
    file_size_mb = downloaded.stat().st_size / (1024 * 1024)
    logger.info(f"Download complete: {downloaded.name} ({file_size_mb:.2f} MB)")
    return downloaded


def transcode_to_h265(input_path: Path, output_path: Path) -> Path:
    """
    Compress and transcode video into high-efficiency H.265 (libx265) MP4 format.
    Calculates bitrate dynamically to ensure the output remains strictly under 2GB.
    """
    logger.info(f"Starting H.265 video compression: {input_path}")
    duration = get_media_duration_seconds(str(input_path))
    input_size = input_path.stat().st_size

    # Bitrate calculation to guarantee output size < 2GB
    # Target size = 1.90 GB (leaves headroom for container overhead)
    if duration > 0:
        available_video_bits = (MAX_TARGET_BYTES * 8) - (TARGET_AUDIO_BITRATE_K * 1000 * duration)
        target_video_bitrate_kbps = int((available_video_bits / duration) / 1000)
        # Cap bitrate between 1200 kbps (minimum decent 1080p) and 6000 kbps (crisp H.265)
        target_video_bitrate_kbps = max(1200, min(target_video_bitrate_kbps, 6000))
        logger.info(f"Duration: {duration:.1f}s | Target Video Bitrate: {target_video_bitrate_kbps} kbps")
    else:
        target_video_bitrate_kbps = 2400
        logger.info("Duration unknown. Using default bitrate: 2400 kbps")

    ffmpeg_cmd = [
        "ffmpeg",
        "-y",
        "-i", str(input_path),
        "-c:v", "libx265",
        "-b:v", f"{target_video_bitrate_kbps}k",
        "-maxrate", f"{int(target_video_bitrate_kbps * 1.35)}k",
        "-bufsize", f"{int(target_video_bitrate_kbps * 2)}k",
        "-preset", "medium",
        "-crf", "24",
        "-c:a", "aac",
        "-b:a", f"{TARGET_AUDIO_BITRATE_K}k",
        "-ac", "2",
        "-tag:v", "hvc1",
        "-movflags", "+faststart",
        str(output_path)
    ]

    subprocess.run(ffmpeg_cmd, check=True)

    if not output_path.exists():
        raise RuntimeError("FFmpeg transcode failed: output file not created.")

    out_size_mb = output_path.stat().st_size / (1024 * 1024)
    logger.info(f"Compression finished: {output_path.name} ({out_size_mb:.2f} MB)")
    if output_path.stat().st_size >= 2 * 1024 * 1024 * 1024:
        raise ValueError(f"Output file exceeds 2GB Telegram limit ({out_size_mb:.2f} MB).")

    return output_path


def upload_to_telegram(bot_token: str, channel_id: str, video_path: Path, caption: str) -> dict:
    """
    Uploads compressed video to Telegram Channel and extracts file_id and message details.
    Uses multipart/form-data upload via Telegram Bot API sendVideo.
    """
    logger.info(f"Uploading {video_path.name} to Telegram Channel: {channel_id}")
    url = f"https://api.telegram.org/bot{bot_token}/sendVideo"

    clean_caption = (caption[:1020] + "...") if len(caption) > 1024 else caption

    with open(video_path, "rb") as video_file:
        files = {
            "video": (video_path.name, video_file, "video/mp4")
        }
        data = {
            "chat_id": channel_id,
            "caption": clean_caption,
            "supports_streaming": "true"
        }
        response = requests.post(url, data=data, files=files, timeout=900)

    if not response.ok:
        logger.error(f"Telegram upload failed: {response.status_code} - {response.text}")
        response.raise_for_status()

    result = response.json().get("result", {})
    video_meta = result.get("video") or result.get("document") or {}
    file_id = video_meta.get("file_id")
    message_id = result.get("message_id")

    # Generate reference URLs
    # Strip '-100' prefix if present for channel direct telegram link
    clean_cid = str(channel_id).replace("-100", "").replace("-", "")
    telegram_web_url = f"https://t.me/c/{clean_cid}/{message_id}" if message_id else ""

    logger.info(f"Uploaded successfully! Telegram file_id: {file_id} | Message ID: {message_id}")
    return {
        "file_id": file_id,
        "message_id": message_id,
        "channel_url": telegram_web_url,
        "raw_result": result
    }


def fetch_tmdb_metadata(api_key: str, tmdb_id: str) -> dict:
    """
    Query TMDb API v3 for movie or TV show metadata.
    Extracts Title, Overview, Poster Path, and Release Date.
    """
    logger.info(f"Querying TMDb metadata for ID: {tmdb_id}")
    headers = {"Accept": "application/json"}

    # Try movie endpoint first
    movie_url = f"https://api.themoviedb.org/3/movie/{tmdb_id}?api_key={api_key}&language=en-US"
    resp = requests.get(movie_url, headers=headers, timeout=15)

    if resp.status_code == 200:
        data = resp.json()
        title = data.get("title") or "Untitled Movie"
        overview = data.get("overview") or ""
        poster_path = data.get("poster_path") or ""
        release_date = data.get("release_date") or ""
        media_type = "movie"
    else:
        # Fallback to TV show endpoint
        tv_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}?api_key={api_key}&language=en-US"
        tv_resp = requests.get(tv_url, headers=headers, timeout=15)
        if tv_resp.status_code == 200:
            data = tv_resp.json()
            title = data.get("name") or "Untitled Show"
            overview = data.get("overview") or ""
            poster_path = data.get("poster_path") or ""
            release_date = data.get("first_air_date") or ""
            media_type = "tv"
        else:
            logger.warning(f"Could not find TMDb record for ID {tmdb_id}. Using fallback values.")
            return {
                "title": f"Media #{tmdb_id}",
                "overview": "Automated transcode entry.",
                "poster_path": "",
                "release_date": datetime.utcnow().strftime("%Y-%m-%d"),
                "media_type": "unknown"
            }

    logger.info(f"Found TMDb record: '{title}' ({release_date})")
    return {
        "title": title,
        "overview": overview,
        "poster_path": poster_path,
        "release_date": release_date,
        "media_type": media_type
    }


def upsert_supabase_movie(supabase_url: str, service_role_key: str, tmdb_id: str, metadata: dict, upload_data: dict, source_url: str):
    """
    Connect to Supabase using supabase-py and perform UPSERT logic on 'movies' table:
    - If tmdb_id exists: Append new stream server link to 'servers' array & update 'download_url'.
    - If tmdb_id does not exist: Insert full movie record with metadata, servers, and download_url.
    """
    if create_client is None:
        raise ImportError("supabase package is required. Install with 'pip install supabase'.")

    logger.info(f"Connecting to Supabase at: {supabase_url}")
    supabase: Client = create_client(supabase_url, service_role_key)

    numeric_tmdb_id = int(tmdb_id) if tmdb_id.isdigit() else tmdb_id
    stream_link = upload_data.get("channel_url") or f"tg://file_id?id={upload_data.get('file_id')}"
    file_id = upload_data.get("file_id")

    server_entry = {
        "name": "Telegram CDN (H.265 / 1080p)",
        "url": stream_link,
        "file_id": file_id,
        "quality": "1080p HEVC",
        "processed_at": datetime.utcnow().isoformat()
    }

    # Query existing record
    query_resp = supabase.table("movies").select("*").eq("tmdb_id", numeric_tmdb_id).execute()
    existing_records = query_resp.data if query_resp else []

    if existing_records and len(existing_records) > 0:
        record = existing_records[0]
        logger.info(f"Found existing movie record for TMDb {tmdb_id}. Appending to servers array...")

        current_servers = record.get("servers") or []
        if not isinstance(current_servers, list):
            current_servers = [current_servers]

        # Prevent duplicate entries for identical file_id
        if not any(s.get("file_id") == file_id for s in current_servers if isinstance(s, dict)):
            current_servers.append(server_entry)

        update_payload = {
            "servers": current_servers,
            "download_url": stream_link,
            "updated_at": datetime.utcnow().isoformat()
        }

        update_resp = supabase.table("movies").update(update_payload).eq("tmdb_id", numeric_tmdb_id).execute()
        logger.info(f"Successfully updated record in Supabase: {update_resp.data}")
    else:
        logger.info(f"No existing record found for TMDb {tmdb_id}. Inserting new record...")
        new_record = {
            "tmdb_id": numeric_tmdb_id,
            "title": metadata["title"],
            "overview": metadata["overview"],
            "poster_path": metadata["poster_path"],
            "release_date": metadata["release_date"] or None,
            "servers": [server_entry],
            "download_url": stream_link,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }

        insert_resp = supabase.table("movies").insert(new_record).execute()
        logger.info(f"Successfully inserted record in Supabase: {insert_resp.data}")


def main():
    logger.info("=== MEDIA PROCESSING ENGINE STARTED ===")
    tmdb_id, source_url = load_input_parameters()

    telegram_bot_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    telegram_channel_id = os.environ.get("TELEGRAM_CHANNEL_ID", "-1004408587176")
    supabase_url = os.environ.get("SUPABASE_URL", "https://tmomuyxckjhlsjfbzfvz.supabase.co")
    supabase_service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    tmdb_api_key = os.environ.get("TMDB_API_KEY")

    # Validate required credentials
    missing_secrets = []
    if not telegram_bot_token: missing_secrets.append("TELEGRAM_BOT_TOKEN")
    if not supabase_service_role_key: missing_secrets.append("SUPABASE_SERVICE_ROLE_KEY")
    if not tmdb_api_key: missing_secrets.append("TMDB_API_KEY")

    if missing_secrets:
        logger.error(f"Missing mandatory environment secrets: {', '.join(missing_secrets)}")
        sys.exit(1)

    work_dir = Path("/tmp/media_engine")
    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Step 1: Query TMDb for metadata
        metadata = fetch_tmdb_metadata(tmdb_api_key, tmdb_id)

        # Step 2: Download raw media
        raw_video = download_media(source_url, work_dir)

        # Step 3: Compress to H.265 MP4 (< 2GB)
        compressed_video = work_dir / f"processed_{tmdb_id}.mp4"
        transcode_to_h265(raw_video, compressed_video)

        # Step 4: Upload to Telegram Channel
        caption = f"🎬 {metadata['title']} ({metadata['release_date'][:4] if metadata['release_date'] else 'N/A'})\n\n{metadata['overview']}\n\nTMDb ID: {tmdb_id}"
        upload_data = upload_to_telegram(telegram_bot_token, telegram_channel_id, compressed_video, caption)

        # Step 5: Perform Supabase UPSERT
        upsert_supabase_movie(
            supabase_url=supabase_url,
            service_role_key=supabase_service_role_key,
            tmdb_id=tmdb_id,
            metadata=metadata,
            upload_data=upload_data,
            source_url=source_url
        )

        logger.info("=== PIPELINE EXECUTION COMPLETED SUCCESSFULLY ===")

    except Exception as exc:
        logger.exception(f"Pipeline failed with exception: {exc}")
        sys.exit(1)
    finally:
        # Cleanup temporary files
        if work_dir.exists():
            logger.info("Cleaning up temporary scratch directory...")
            shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
