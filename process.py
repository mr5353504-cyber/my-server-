#!/usr/bin/env python3
"""
Pixeldrain Ultra-Speed Cloud Ingest & Streaming Pipeline
=========================================================
1. Multi-threaded Aria2c Download (16 connections, up to 100 MB/s).
2. Direct Upload to Pixeldrain API with instant File ID generation.
3. Outputs permanent Watch Link and Download Link for the website player.
4. Updates Supabase (if configured).
"""

import os
import sys
import json
import base64
import shutil
import logging
import subprocess
from pathlib import Path
import urllib.request
import urllib.error

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("PixeldrainEngine")

DEFAULT_API_KEY = "1d5668c3-d5f4-44ef-8665-93e5c683a724"
PIXELDRAIN_API_KEY = os.environ.get("PIXELDRAIN_API_KEY", DEFAULT_API_KEY).strip()
DOWNLOAD_DIR = Path("/tmp/movie_downloads")


def download_with_aria2(source_url: str, output_dir: Path) -> Path:
    """Download movie file using multi-threaded aria2c"""
    output_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"Initiating 16-thread Aria2c download from: {source_url}")

    cmd = [
        "aria2c",
        "--split=16",
        "--max-connection-per-server=16",
        "--min-split-size=1M",
        "--file-allocation=none",
        "--auto-file-renaming=false",
        "--allow-overwrite=true",
        "--dir", str(output_dir),
        "--summary-interval=5",
        source_url
    ]

    process = subprocess.run(cmd, capture_output=True, text=True)
    if process.returncode != 0:
        logger.warning(f"Aria2c exited with code {process.returncode}. Output:\n{process.stderr}")
        # Fallback to curl if aria2 fails (e.g. for certain redirects)
        logger.info("Attempting fallback download via curl...")
        target_file = output_dir / "movie.mp4"
        curl_cmd = ["curl", "-L", "-o", str(target_file), source_url]
        subprocess.run(curl_cmd, check=True)

    # Locate downloaded file (ignore .aria2 control files)
    files = [f for f in output_dir.iterdir() if f.is_file() and not f.name.endswith(".aria2")]
    if not files:
        raise RuntimeError("No file was downloaded!")

    # Pick the largest file
    downloaded_file = max(files, key=lambda f: f.stat().st_size)
    size_mb = downloaded_file.stat().st_size / (1024 * 1024)
    logger.info(f"Downloaded file: {downloaded_file.name} ({size_mb:.2f} MB)")

    if downloaded_file.stat().st_size < 5 * 1024 * 1024:
        logger.warning(f"File size is very small ({size_mb:.2f} MB). Might be an error page or short clip.")

    return downloaded_file


def upload_to_pixeldrain(file_path: Path, api_key: str) -> dict:
    """Upload file directly to Pixeldrain API using streaming PUT"""
    filename = file_path.name
    upload_url = f"https://pixeldrain.com/api/file/{urllib.parse.quote(filename)}"
    file_size = file_path.stat().st_size
    size_mb = file_size / (1024 * 1024)

    logger.info(f"Uploading {filename} ({size_mb:.2f} MB) to Pixeldrain API...")

    auth_string = f":{api_key}"
    auth_header = "Basic " + base64.b64encode(auth_string.encode("utf-8")).decode("utf-8")

    # Use curl for reliable large file streaming up to 10GB
    curl_cmd = [
        "curl",
        "-s",
        "-T", str(file_path),
        "-H", f"Authorization: {auth_header}",
        "-H", "User-Agent: MovieStreamEngine/1.0",
        upload_url
    ]

    res = subprocess.run(curl_cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"Pixeldrain upload failed: {res.stderr}")

    try:
        response_data = json.loads(res.stdout)
    except Exception as e:
        raise RuntimeError(f"Invalid response from Pixeldrain: {res.stdout}") from e

    if not response_data.get("success") or "id" not in response_data:
        raise RuntimeError(f"Pixeldrain rejected upload: {response_data}")

    file_id = response_data["id"]
    logger.info(f"Upload Successful! Pixeldrain File ID: {file_id}")
    return response_data


def update_supabase(tmdb_id: str, title: str, watch_url: str, download_url: str, file_id: str):
    """Optional sync to Supabase movies table"""
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        logger.info("Supabase credentials not configured. Skipping DB upsert.")
        return

    try:
        from supabase import create_client
        client = create_client(supabase_url, supabase_key)
        data = {
            "tmdb_id": tmdb_id,
            "title": title,
            "stream_url": watch_url,
            "download_url": download_url,
            "pixeldrain_id": file_id,
            "status": "completed",
            "updated_at": "now()"
        }
        client.table("movies").upsert(data, on_conflict="tmdb_id").execute()
        logger.info(f"Successfully upserted movie #{tmdb_id} to Supabase!")
    except Exception as e:
        logger.warning(f"Failed to upsert to Supabase: {e}")


def main():
    source_url = os.environ.get("SOURCE_URL", "").strip()
    tmdb_id = os.environ.get("TMDB_ID", "157336").strip()
    movie_title = os.environ.get("MOVIE_TITLE", "").strip() or f"Movie #{tmdb_id}"

    if not source_url:
        logger.error("No SOURCE_URL provided!")
        sys.exit(1)

    logger.info("=" * 60)
    logger.info("PIXELDRAIN CLOUD INGEST & STREAM ENGINE")
    logger.info(f"Target TMDb ID: {tmdb_id}")
    logger.info(f"Source URL:     {source_url}")
    logger.info(f"API Key:        {PIXELDRAIN_API_KEY[:6]}...{PIXELDRAIN_API_KEY[-4:]}")
    logger.info("=" * 60)

    # Check if link is ALREADY a Pixeldrain link
    if "pixeldrain.com" in source_url:
        import re
        match = re.search(r"pixeldrain\.com/(?:u|api/file)/([a-zA-Z0-9_-]+)", source_url)
        if match:
            file_id = match.group(1)
            logger.info(f"Source is already a Pixeldrain link with ID: {file_id}")
            watch_url = f"https://pixeldrain.com/api/file/{file_id}"
            download_url = f"https://pixeldrain.com/api/file/{file_id}?download"

            output = {
                "success": True,
                "file_id": file_id,
                "watch_url": watch_url,
                "download_url": download_url,
                "title": movie_title,
                "tmdb_id": tmdb_id
            }
            print("\nRESULT_JSON_START")
            print(json.dumps(output, indent=2))
            print("RESULT_JSON_END\n")
            update_supabase(tmdb_id, movie_title, watch_url, download_url, file_id)
            return

    # 1. Download source file
    downloaded_file = download_with_aria2(source_url, DOWNLOAD_DIR)

    # 2. Upload to Pixeldrain API
    resp = upload_to_pixeldrain(downloaded_file, PIXELDRAIN_API_KEY)
    file_id = resp["id"]

    # 3. Output Links
    watch_url = f"https://pixeldrain.com/api/file/{file_id}"
    download_url = f"https://pixeldrain.com/api/file/{file_id}?download"

    output = {
        "success": True,
        "file_id": file_id,
        "title": downloaded_file.stem,
        "tmdb_id": tmdb_id,
        "watch_url": watch_url,
        "download_url": download_url,
        "size_mb": f"{(downloaded_file.stat().st_size / (1024 * 1024)):.2f} MB"
    }

    print("\n" + "=" * 60)
    print("PIXELDRAIN OUTPUT GENERATED SUCCESSFULLY!")
    print(f"🎬 Watch Link:    {watch_url}")
    print(f"📥 Download Link: {download_url}")
    print("=" * 60)
    print("\nRESULT_JSON_START")
    print(json.dumps(output, indent=2))
    print("RESULT_JSON_END\n")

    # GitHub Actions Step Summary
    summary_file = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_file:
        with open(summary_file, "a") as f:
            f.write(f"## 🎬 Pixeldrain Stream & Download Links Generated\n\n")
            f.write(f"- **Movie Title:** {output['title']}\n")
            f.write(f"- **File Size:** {output.get('size_mb', 'N/A')}\n")
            f.write(f"- **🎬 Watch Link:** `{watch_url}`\n")
            f.write(f"- **📥 Download Link:** `{download_url}`\n\n")
            f.write(f"[Watch in Website Cinema Player]({watch_url})\n")

    # Update database
    update_supabase(tmdb_id, output['title'], watch_url, download_url, file_id)

    # Cleanup temp download
    try:
        shutil.rmtree(DOWNLOAD_DIR)
    except Exception:
        pass


if __name__ == "__main__":
    main()
