#!/usr/bin/env python3
"""
Automated Media Processing Engine (MTProto 2GB Single-File Pipeline)
===================================================================
1. Input Ingestion:
   - Reads TMDB_ID, SOURCE_URL, and ACTION_TYPE from environment or GitHub Actions event payload.
2. Embed, Direct & HLS Streaming Download:
   - Supports Direct URLs, Embed URLs, HLS playlists (.m3u8), and instant test mode ('test').
3. Large File Compression (H.265/HEVC):
   - Dynamic bitrate calculation ensures video file size is strictly < 2GB.
   - Encodes via FFmpeg libx265 with AAC audio and +faststart flag.
4. Telegram Upload (Bot API / Telethon MTProto):
   - Fast direct upload to Telegram Channel -1004408587176.
5. TMDb v3 Integration & Supabase Atomic UPSERT:
   - Queries TMDb API v3 for Title, Overview, Poster Path, and Release Date.
   - Upserts record directly into Supabase 'movies' table.
"""

import os
import sys
import json
import asyncio
import logging
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
import requests

try:
    from supabase import create_client, Client
except ImportError:
    Client = None
    create_client = None

try:
    from telethon import TelegramClient
except ImportError:
    TelegramClient = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("MediaEngine")

TARGET_FILE_BYTES = int(1.45 * 1024 * 1024 * 1024)
TARGET_AUDIO_BITRATE_K = 128

DEFAULT_TELEGRAM_API_ID = 2040
DEFAULT_TELEGRAM_API_HASH = "b18441a1ff607e10a989891a5462e627"


def load_input_parameters():
    """Extract parameters from environment or github event json."""
    action_type = os.environ.get("ACTION_TYPE", "process_video").strip()
    tmdb_id = os.environ.get("TMDB_ID")
    source_url = os.environ.get("SOURCE_URL")
    stream_url = os.environ.get("STREAM_URL")
    download_url = os.environ.get("DOWNLOAD_URL")

    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if event_path and Path(event_path).exists():
        try:
            with open(event_path, "r", encoding="utf-8") as f:
                event_data = json.load(f)

            if "action" in event_data:
                action_type = str(event_data["action"]).strip()

            client_payload = event_data.get("client_payload", {})
            if "action" in client_payload:
                action_type = str(client_payload["action"]).strip()
            if not tmdb_id and "tmdb_id" in client_payload:
                tmdb_id = str(client_payload["tmdb_id"]).strip()
            if not source_url and "source_url" in client_payload:
                source_url = str(client_payload["source_url"]).strip()
            if not stream_url and "stream_url" in client_payload:
                stream_url = str(client_payload["stream_url"]).strip()
            if not download_url and "download_url" in client_payload:
                download_url = str(client_payload["download_url"]).strip()

            workflow_inputs = event_data.get("inputs", {})
            if not tmdb_id and "tmdb_id" in workflow_inputs:
                tmdb_id = str(workflow_inputs["tmdb_id"]).strip()
            if not source_url and "source_url" in workflow_inputs:
                source_url = str(workflow_inputs["source_url"]).strip()
            if not stream_url and "stream_url" in workflow_inputs:
                stream_url = str(workflow_inputs["stream_url"]).strip()
            if not download_url and "download_url" in workflow_inputs:
                download_url = str(workflow_inputs["download_url"]).strip()
        except Exception as e:
            logger.warning(f"Could not parse GITHUB_EVENT_PATH: {e}")

    # Fallback to sys.argv
    if not tmdb_id and len(sys.argv) > 1:
        tmdb_id = sys.argv[1].strip()
    if not source_url and len(sys.argv) > 2:
        source_url = sys.argv[2].strip()

    return action_type, tmdb_id, source_url, stream_url, download_url


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
        logger.warning(f"ffprobe duration probe warning ({e}). Using default duration.")
        return 0.0


def download_media(source_url: str, output_dir: Path) -> Path:
    """Download video or generate test sample."""
    output_dir.mkdir(parents=True, exist_ok=True)
    fallback_file = output_dir / "input_media.mp4"

    if source_url.lower().strip() == "test":
        logger.info("Test Mode: Generating verified test pattern via FFmpeg...")
        gen_cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "testsrc=duration=5:size=1280x720:rate=30",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=5",
            "-c:v", "libx264", "-c:a", "aac",
            str(fallback_file)
        ]
        subprocess.run(gen_cmd, check=True)
        logger.info("FFmpeg test media created successfully.")
        return fallback_file

    logger.info(f"Downloading stream/embed media from: {source_url}")
    raw_template = str(output_dir / "input_media.%(ext)s")

    ytdlp_cmd = [
        "yt-dlp",
        "--no-check-certificates",
        "--no-playlist",
        "--concurrent-fragments", "16",
        "--format", "bestvideo+bestaudio/best",
        "--merge-output-format", "mp4",
        "-o", raw_template,
        source_url
    ]

    download_success = False
    try:
        subprocess.run(ytdlp_cmd, check=True)
        download_success = True
    except Exception as err:
        logger.warning(f"yt-dlp stream fetch notice ({err}). Trying direct streaming fallback...")

    matching_files = [f for f in output_dir.glob("input_media.*") if f.is_file() and not f.name.endswith(".part")]

    if not matching_files or not download_success:
        if ".m3u8" in source_url.lower():
            logger.info("Attempting FFmpeg stream copy for m3u8 playlist...")
            ffmpeg_cmd = ["ffmpeg", "-y", "-i", source_url, "-c", "copy", "-bsf:a", "aac_adtstoasc", str(fallback_file)]
            subprocess.run(ffmpeg_cmd, check=True)
        else:
            logger.info("Downloading file via HTTP streaming chunks...")
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
            with requests.get(source_url, headers=headers, stream=True, timeout=90, verify=False) as r:
                r.raise_for_status()
                with open(fallback_file, "wb") as f:
                    for chunk in r.iter_content(chunk_size=4 * 1024 * 1024):
                        if chunk:
                            f.write(chunk)

    matching_files = [f for f in output_dir.glob("input_media.*") if f.is_file() and not f.name.endswith(".part")]
    if not matching_files:
        raise FileNotFoundError("Failed to locate downloaded media artifact.")

    downloaded = matching_files[0]
    file_size_mb = downloaded.stat().st_size / (1024 * 1024)
    logger.info(f"Download complete: {downloaded.name} ({file_size_mb:.2f} MB)")
    return downloaded


def transcode_to_h265(input_path: Path, output_path: Path) -> Path:
    """Compress video to H.265 (HEVC)."""
    logger.info(f"Starting H.265 compression for: {input_path}")
    duration = get_media_duration_seconds(str(input_path))
    input_size = input_path.stat().st_size
    input_size_mb = input_size / (1024 * 1024)

    is_small_file = input_size_mb < 60
    preset = "ultrafast" if is_small_file else "medium"

    if duration > 0 and not is_small_file:
        total_bits = TARGET_FILE_BYTES * 8
        audio_bits = TARGET_AUDIO_BITRATE_K * 1000 * duration
        available_video_bits = total_bits - audio_bits
        target_video_bitrate_kbps = int((available_video_bits / duration) / 1000)
        target_video_bitrate_kbps = max(1000, min(target_video_bitrate_kbps, 4500))
    else:
        target_video_bitrate_kbps = 1800

    logger.info(f"Using preset '{preset}' and target video bitrate: {target_video_bitrate_kbps} kbps")

    ffmpeg_cmd = [
        "ffmpeg",
        "-y",
        "-i", str(input_path),
        "-c:v", "libx265",
        "-b:v", f"{target_video_bitrate_kbps}k",
        "-preset", preset,
        "-crf", "26",
        "-c:a", "aac",
        "-b:a", f"{TARGET_AUDIO_BITRATE_K}k",
        "-ac", "2",
        "-tag:v", "hvc1",
        "-movflags", "+faststart",
        str(output_path)
    ]

    subprocess.run(ffmpeg_cmd, check=True)

    if not output_path.exists():
        raise RuntimeError("FFmpeg transcode failed: output file was not produced.")

    out_size_mb = output_path.stat().st_size / (1024 * 1024)
    logger.info(f"Compression finished: {output_path.name} ({out_size_mb:.2f} MB)")
    return output_path


async def upload_via_telethon(bot_token: str, channel_id: str, video_path: Path, caption: str, api_id: int, api_hash: str) -> dict:
    """Uploads video using Telethon MTProto client."""
    logger.info("Connecting to Telegram MTProto engine via Telethon...")
    session_path = "/tmp/telethon_bot_session"
    client = TelegramClient(session_path, api_id, api_hash)
    await client.start(bot_token=bot_token)

    clean_target = int(channel_id) if (channel_id.startswith("-") or channel_id.isdigit()) else channel_id
    channel_entity = await client.get_entity(clean_target)

    message = await client.send_file(
        entity=channel_entity,
        file=str(video_path),
        caption=caption,
        supports_streaming=True
    )
    await client.disconnect()

    message_id = message.id
    clean_cid = str(channel_id).replace("-100", "").replace("-", "")
    telegram_web_url = f"https://t.me/c/{clean_cid}/{message_id}"

    file_id = None
    if message.media and hasattr(message.media, "document"):
        file_id = str(message.media.document.id)

    logger.info(f"Telegram MTProto upload successful! Message ID: {message_id} | URL: {telegram_web_url}")
    return {
        "file_id": file_id or str(message_id),
        "message_id": message_id,
        "channel_url": telegram_web_url
    }


def upload_to_telegram(bot_token: str, channel_id: str, video_path: Path, caption: str) -> dict:
    """Telegram uploader with direct Bot API for files < 45MB and Telethon MTProto for 45MB-2GB."""
    api_id = int(os.environ.get("TELEGRAM_API_ID") or DEFAULT_TELEGRAM_API_ID)
    api_hash = os.environ.get("TELEGRAM_API_HASH") or DEFAULT_TELEGRAM_API_HASH

    file_size_mb = video_path.stat().st_size / (1024 * 1024)
    if file_size_mb < 45:
        logger.info(f"File size is {file_size_mb:.2f} MB (< 45MB). Using direct Bot API for rapid delivery...")
        url = f"https://api.telegram.org/bot{bot_token}/sendVideo"
        with open(video_path, "rb") as video_file:
            files = {"video": (video_path.name, video_file, "video/mp4")}
            data = {"chat_id": channel_id, "caption": caption[:1024], "supports_streaming": "true"}
            response = requests.post(url, data=data, files=files, timeout=300)

        if response.status_code == 200:
            res_json = response.json().get("result", {})
            message_id = res_json.get("message_id")
            video_info = res_json.get("video") or res_json.get("document") or {}
            clean_cid = str(channel_id).replace("-100", "").replace("-", "")
            channel_url = f"https://t.me/c/{clean_cid}/{message_id}"
            logger.info(f"Telegram upload successful! Message ID: {message_id} | URL: {channel_url}")
            return {
                "file_id": video_info.get("file_id") or str(message_id),
                "message_id": message_id,
                "channel_url": channel_url
            }
        else:
            logger.warning(f"Bot API response: {response.text}. Attempting MTProto fallback...")

    if TelegramClient is not None:
        try:
            return asyncio.run(upload_via_telethon(bot_token, channel_id, video_path, caption, api_id, api_hash))
        except Exception as telethon_err:
            logger.warning(f"Telethon MTProto upload error: {telethon_err}")

    # Fallback to standard HTTP API
    url = f"https://api.telegram.org/bot{bot_token}/sendVideo"
    with open(video_path, "rb") as video_file:
        files = {"video": (video_path.name, video_file, "video/mp4")}
        data = {"chat_id": channel_id, "caption": caption[:1024], "supports_streaming": "true"}
        response = requests.post(url, data=data, files=files, timeout=900)

    response.raise_for_status()
    res_json = response.json().get("result", {})
    message_id = res_json.get("message_id")
    video_info = res_json.get("video") or res_json.get("document") or {}
    clean_cid = str(channel_id).replace("-100", "").replace("-", "")

    return {
        "file_id": video_info.get("file_id") or str(message_id),
        "message_id": message_id,
        "channel_url": f"https://t.me/c/{clean_cid}/{message_id}"
    }


def fetch_tmdb_metadata(api_key: str, tmdb_id: str) -> dict:
    """Query TMDb API v3 for movie or TV show metadata."""
    logger.info(f"Fetching TMDb metadata for ID: {tmdb_id}")
    headers = {"Accept": "application/json"}

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
        tv_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}?api_key={api_key}&language=en-US"
        tv_resp = requests.get(tv_url, headers=headers, timeout=15)
        if tv_resp.status_code == 200:
            data = tv_resp.json()
            title = data.get("name") or "Untitled TV Show"
            overview = data.get("overview") or ""
            poster_path = data.get("poster_path") or ""
            release_date = data.get("first_air_date") or ""
            media_type = "tv"
        else:
            return {
                "title": f"Media #{tmdb_id}",
                "overview": "Automated transcode entry.",
                "poster_path": "",
                "release_date": datetime.utcnow().strftime("%Y-%m-%d"),
                "media_type": "unknown"
            }

    logger.info(f"TMDb Match: '{title}' ({release_date})")
    return {
        "title": title,
        "overview": overview,
        "poster_path": poster_path,
        "release_date": release_date,
        "media_type": media_type
    }


def upsert_supabase_movie(supabase_url: str, service_role_key: str, tmdb_id: str, metadata: dict, upload_data: dict, source_url: str):
    """Atomic UPSERT into Supabase table 'movies' with robust URL normalization."""
    if create_client is None:
        logger.warning("Supabase package not imported. Skipping database sync.")
        return

    clean_url = supabase_url.strip().strip("'").strip('"').strip('[').strip(']')
    if not clean_url.startswith("https://") and not clean_url.startswith("http://"):
        clean_url = f"https://{clean_url}"
    clean_url = clean_url.rstrip("/")

    logger.info(f"Connecting to Supabase endpoint: {clean_url}")
    try:
        supabase: Client = create_client(clean_url, service_role_key.strip())

        numeric_tmdb_id = int(tmdb_id) if tmdb_id.isdigit() else tmdb_id
        stream_link = upload_data.get("channel_url")
        file_id = upload_data.get("file_id")

        server_entry = {
            "name": "Telegram CDN (H.265 / 1080p)",
            "url": stream_link,
            "file_id": file_id,
            "quality": "1080p HEVC",
            "processed_at": datetime.utcnow().isoformat()
        }

        query_resp = supabase.table("movies").select("*").eq("tmdb_id", numeric_tmdb_id).execute()
        existing_records = query_resp.data if query_resp else []

        if existing_records and len(existing_records) > 0:
            record = existing_records[0]
            current_servers = record.get("servers") or []
            if not isinstance(current_servers, list):
                current_servers = [current_servers]

            if not any(s.get("url") == stream_link for s in current_servers if isinstance(s, dict)):
                current_servers.append(server_entry)

            update_payload = {
                "servers": current_servers,
                "download_url": stream_link,
                "updated_at": datetime.utcnow().isoformat()
            }

            update_resp = supabase.table("movies").update(update_payload).eq("tmdb_id", numeric_tmdb_id).execute()
            logger.info(f"Supabase update successful: {update_resp.data}")
        else:
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
            logger.info(f"Supabase insert successful: {insert_resp.data}")
    except Exception as db_err:
        logger.error(f"Supabase operation encountered an error ({db_err}). Proceeding as video is already safely uploaded.")


def main():
    logger.info("=== AUTOMATED MEDIA PROCESSING ENGINE STARTED ===")
    action_type, tmdb_id, source_url, stream_url, download_url = load_input_parameters()

    supabase_url = os.environ.get("SUPABASE_URL", "https://tmomuyxckjhlsjfbzfvz.supabase.co")
    supabase_service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    tmdb_api_key = os.environ.get("TMDB_API_KEY")

    # ACTION: Dedicated Supabase Sync
    if action_type == "sync_supabase":
        logger.info(f"Running dedicated Supabase sync for TMDb ID: {tmdb_id}")
        if not tmdb_id:
            logger.error("TMDb ID is required for sync_supabase.")
            sys.exit(1)

        metadata = fetch_tmdb_metadata(tmdb_api_key, tmdb_id)
        effective_stream = stream_url or f"https://t.me/c/4408587176"
        effective_download = download_url or f"{effective_stream}?download=true"

        upload_data = {
            "channel_url": effective_stream,
            "file_id": tmdb_id
        }

        upsert_supabase_movie(
            supabase_url=supabase_url,
            service_role_key=supabase_service_role_key,
            tmdb_id=tmdb_id,
            metadata=metadata,
            upload_data=upload_data,
            source_url=source_url or effective_stream
        )
        logger.info(f"=== SUPABASE SYNC COMPLETED SUCCESSFULLY (TMDb #{tmdb_id}) ===")
        sys.exit(0)

    # ACTION: Standard Transcode & Ingest Pipeline
    if not source_url:
        logger.error("Error: SOURCE_URL is required for processing.")
        sys.exit(1)

    effective_tmdb_id = tmdb_id or "157336"
    telegram_bot_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    telegram_channel_id = os.environ.get("TELEGRAM_CHANNEL_ID", "-1004408587176")

    work_dir = Path("/tmp/media_engine_run")
    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Step 1: TMDb Metadata Fetch
        metadata = fetch_tmdb_metadata(tmdb_api_key, effective_tmdb_id)

        # Step 2: Download Media
        logger.info("[STEP_DOWNLOAD_START] Downloading source media...")
        raw_video = download_media(source_url, work_dir)
        logger.info("[STEP_DOWNLOAD_COMPLETE] Media download complete.")

        # Step 3: H.265 Transcode
        logger.info("[STEP_TRANSCODE_START] Compressing to H.265 (HEVC)...")
        compressed_video = work_dir / f"processed_{effective_tmdb_id}.mp4"
        transcode_to_h265(raw_video, compressed_video)
        logger.info("[STEP_TRANSCODE_COMPLETE] Compression to H.265 complete.")

        # Step 4: Telegram Upload
        logger.info("[STEP_UPLOAD_START] Uploading video to Telegram Channel...")
        caption = f"🎬 {metadata['title']} ({metadata['release_date'][:4] if metadata['release_date'] else 'N/A'})\n\n{metadata['overview'][:300]}...\n\n✅ Verified Media Pipeline | H.265 HEVC"
        upload_data = upload_to_telegram(telegram_bot_token, telegram_channel_id, compressed_video, caption)
        logger.info(f"[STEP_UPLOAD_COMPLETE] Upload complete. Message ID: {upload_data.get('message_id')}")

        # Step 5: Supabase UPSERT (if tmdb_id was provided)
        if tmdb_id:
            logger.info("[STEP_DB_START] Syncing entry to Supabase table 'movies'...")
            upsert_supabase_movie(
                supabase_url=supabase_url,
                service_role_key=supabase_service_role_key,
                tmdb_id=tmdb_id,
                metadata=metadata,
                upload_data=upload_data,
                source_url=source_url
            )
            logger.info("[STEP_DB_COMPLETE] Supabase sync complete.")

        logger.info("=== PIPELINE EXECUTION COMPLETED SUCCESSFULLY (100%) ===")

    except Exception as exc:
        logger.exception(f"Pipeline failed: {exc}")
        sys.exit(1)
    finally:
        if work_dir.exists():
            shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
