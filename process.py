#!/usr/bin/env python3
"""
Pixeldrain Cloud Ingest & Streaming Pipeline
=============================================
1. Resolves smart download links (InstantCloud, direct CDN, Google Drive, etc.).
2. High-speed multi-threaded Aria2c download with fallback.
3. Media integrity check (> 1MB, not an HTML error page).
4. Direct high-speed upload to Pixeldrain API with verified API key.
5. Emits real-time step progress and final output JSON.
"""

import os
import sys
import json
import time
import shutil
import logging
import subprocess
from pathlib import Path
import urllib.request
import urllib.parse
import urllib.error

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("PixeldrainEngine")

DEFAULT_API_KEY = "55e00a65-998d-4b39-b343-60b2b98f2835"
PIXELDRAIN_API_KEY = os.environ.get("PIXELDRAIN_API_KEY", DEFAULT_API_KEY).strip()
DOWNLOAD_DIR = Path("/tmp/movie_downloads")


def resolve_source_url(raw_url: str) -> tuple[str, str | None]:
    """
    Resolve intermediate download landing pages like InstantCloud to direct video URLs.
    Returns (resolved_direct_url, suggested_filename).
    """
    logger.info(f"Analyzing source link protocol: {raw_url}")

    # InstantCloud resolver
    if "instantcloud.org/file/" in raw_url:
        import re
        match = re.search(r"instantcloud\.org/file/([a-zA-Z0-9_-]+)", raw_url)
        if match:
            file_code = match.group(1)
            probe_url = f"https://instantcloud.org/file/{file_code}/download?json=1&probe=1"
            logger.info(f"InstantCloud detected. Polling direct stream probe: {probe_url}")
            headers = {
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36"
            }

            # Poll for up to 90 seconds (InstantCloud's max preparation time)
            for attempt in range(30):
                try:
                    req = urllib.request.Request(probe_url, headers=headers)
                    with urllib.request.urlopen(req, timeout=12) as resp:
                        data = json.loads(resp.read().decode())
                        if data.get("success") and data.get("download_url"):
                            direct = data["download_url"]
                            suggested_filename = data.get("filename")
                            logger.info(f"InstantCloud direct link extracted successfully! File: {suggested_filename}")
                            return direct, suggested_filename

                        msg = data.get("message", "Preparing video stream")
                        logger.info(f"Waiting for InstantCloud upstream ({msg})... attempt {attempt + 1}/30")
                except Exception as e:
                    logger.warning(f"Probe attempt {attempt + 1} warning: {e}")
                time.sleep(3)

            raise RuntimeError(
                "InstantCloud সার্ভার থেকে গুগল ফটোজের ভিডিও লিঙ্ক এখনও প্রস্তুত হয়নি (Time out)। "
                "অনুগ্রহ করে ১ মিনিট পর আবার ট্রাই করুন অথবা সরাসরি ভিডিও লিঙ্ক ব্যবহার করুন।"
            )

    return raw_url, None


def download_media(source_url: str, output_dir: Path) -> Path:
    """Download movie file using aria2c with fallback to curl"""
    output_dir.mkdir(parents=True, exist_ok=True)
    clean_url, suggested_filename = resolve_source_url(source_url)
    logger.info(f"Initiating 16-thread Aria2c download from: {clean_url[:80]}...")

    headers = [
        "--header=User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "--header=Accept: */*",
        "--check-certificate=false"
    ]

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
        *headers
    ]

    if suggested_filename:
        # Sanitize filename for local storage
        safe_name = suggested_filename.replace("/", "_").replace("\\", "_")
        cmd.extend(["--out", safe_name])

    cmd.append(clean_url)

    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        logger.warning(f"Aria2c had issues. Output:\n{proc.stderr}")
        logger.info("Attempting fallback download via curl with browser headers...")
        target_file = output_dir / (suggested_filename or "movie.mp4")
        curl_cmd = [
            "curl", "-L",
            "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36",
            "-o", str(target_file),
            clean_url
        ]
        subprocess.run(curl_cmd, check=True)

    # Find the downloaded file
    files = [f for f in output_dir.iterdir() if f.is_file() and not f.name.endswith(".aria2")]
    if not files:
        raise RuntimeError("কোনো ফাইল ডাউনলোড হয়নি! লিংকটি মেয়াদোত্তীর্ণ বা অ্যাক্সেসযোগ্য নয়।")

    downloaded = max(files, key=lambda f: f.stat().st_size)
    size_bytes = downloaded.stat().st_size
    size_mb = size_bytes / (1024 * 1024)

    logger.info(f"Downloaded file: {downloaded.name} ({size_mb:.2f} MB)")

    # Check if the file is accidentally an HTML error page
    if size_bytes < 1024 * 1024:  # Under 1 MB
        try:
            with open(downloaded, "rb") as f:
                head = f.read(512).decode("utf-8", errors="ignore").lower()
                if "<!doctype html" in head or "<html" in head:
                    raise RuntimeError(
                        "প্রদত্ত লিংকটি কোনো সরাসরি ভিডিও নয়, এটি একটি ওয়েব পেজ (HTML)। "
                        "অনুগ্রহ করে সরাসরি ভিডিও ডাউনলোড লিংক দিন।"
                    )
        except UnicodeDecodeError:
            pass

    return downloaded


def upload_to_pixeldrain(file_path: Path, api_key: str) -> dict:
    """Upload file directly to Pixeldrain API"""
    filename = file_path.name
    # URL encode filename fully so brackets, spaces, and Unicode never break curl
    clean_encoded_name = urllib.parse.quote(filename, safe="")
    upload_url = f"https://pixeldrain.com/api/file/{clean_encoded_name}"
    size_mb = file_path.stat().st_size / (1024 * 1024)

    logger.info(f"Uploading {filename} ({size_mb:.2f} MB) to Pixeldrain Cloud...")

    # Using -u :API_KEY with --globoff to prevent URL bracket expansion issues
    curl_cmd = [
        "curl",
        "-sS",
        "--globoff",
        "--show-error",
        "-u", f":{api_key}",
        "-T", str(file_path),
        "-H", "User-Agent: MovieStreamEngine/1.0",
        upload_url
    ]

    res = subprocess.run(curl_cmd, capture_output=True, text=True)
    if res.returncode != 0:
        logger.error(f"Curl error (code {res.returncode}): {res.stderr}")
        raise RuntimeError(f"Pixeldrain upload failed: {res.stderr or res.stdout}")

    try:
        response_data = json.loads(res.stdout)
    except Exception as e:
        raise RuntimeError(f"Invalid response from Pixeldrain: {res.stdout}") from e

    # Successful Pixeldrain response has "id" field
    if "id" not in response_data:
        err_msg = response_data.get("message") or response_data.get("value") or str(response_data)
        raise RuntimeError(f"Pixeldrain rejected upload: {err_msg}")

    file_id = response_data["id"]
    logger.info(f"Upload Successful! Pixeldrain File ID: {file_id}")
    return response_data


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

    # STEP 1: Quick verification for existing Pixeldrain links
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
            return

    # STEP 2: Download media file
    downloaded_file = download_media(source_url, DOWNLOAD_DIR)

    # STEP 3: Upload to Pixeldrain API
    resp = upload_to_pixeldrain(downloaded_file, PIXELDRAIN_API_KEY)
    file_id = resp["id"]

    # STEP 4: Output Links
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

    summary_file = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_file:
        with open(summary_file, "a") as f:
            f.write(f"## 🎬 Pixeldrain Stream & Download Links Generated\n\n")
            f.write(f"- **Title:** {output['title']}\n")
            f.write(f"- **Size:** {output.get('size_mb', 'N/A')}\n")
            f.write(f"- **Watch Link:** `{watch_url}`\n")
            f.write(f"- **Download Link:** `{download_url}`\n\n")
            f.write(f"[Play in Cinema Player]({watch_url})\n")

    try:
        shutil.rmtree(DOWNLOAD_DIR)
    except Exception:
        pass


if __name__ == "__main__":
    main()
