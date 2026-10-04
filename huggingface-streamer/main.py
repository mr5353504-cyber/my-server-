import os
import re
import math
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from telethon import TelegramClient
from telethon.tl.types import DocumentAttributeVideo, DocumentAttributeFilename

API_ID = int(os.environ.get("API_ID", "0"))
API_HASH = os.environ.get("API_HASH", "")
BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
DEFAULT_CHANNEL = os.environ.get("CHANNEL", "server7766").replace("@", "")

client = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global client
    if API_ID and API_HASH and BOT_TOKEN:
        print("[Streamer] Initializing Telethon client...")
        client = TelegramClient("hf_streamer_bot", API_ID, API_HASH)
        await client.start(bot_token=BOT_TOKEN)
        print("[Streamer] Telethon client connected successfully!")
    else:
        print("[Streamer] Warning: API_ID, API_HASH, or BOT_TOKEN missing in environment variables.")
    yield
    if client:
        await client.disconnect()
        print("[Streamer] Telethon client disconnected.")

app = FastAPI(title="Telegram Cloud Video Streamer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Content-Length", "Accept-Ranges", "Content-Type"]
)

@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Telegram Cloud Video Streamer for HTML5 Players",
        "default_channel": DEFAULT_CHANNEL,
        "connected": bool(client and client.is_connected())
    }

@app.get("/health")
async def health():
    return {"status": "ok", "telethon": bool(client and client.is_connected())}

async def stream_telegram_file(channel: str, message_id: int, request: Request):
    if not client or not client.is_connected():
        raise HTTPException(status_code=503, detail="Telegram streaming engine is initializing or credentials missing.")

    try:
        # Resolve target channel entity
        target_entity = await client.get_input_entity(channel)
        msg = await client.get_messages(target_entity, ids=message_id)
        if not msg or not msg.media or not getattr(msg.media, "document", None):
            raise HTTPException(status_code=404, detail="Media file not found in Telegram message.")

        doc = msg.media.document
        file_size = doc.size
        mime_type = doc.mime_type or "video/mp4"

        # Find filename if available
        file_name = "movie.mp4"
        for attr in doc.attributes:
            if isinstance(attr, DocumentAttributeFilename):
                file_name = attr.file_name
                break

        range_header = request.headers.get("range")
        start = 0
        end = file_size - 1

        if range_header:
            match = re.match(r"bytes=(\d+)-(\d*)", range_header)
            if match:
                start = int(match.group(1))
                if match.group(2):
                    end = int(match.group(2))

        # Ensure valid range bounds
        start = max(0, min(start, file_size - 1))
        end = max(start, min(end, file_size - 1))
        content_length = (end - start) + 1

        # Chunk generator with 512KB chunks for high-speed sequential streaming
        chunk_size = 512 * 1024

        async def file_chunk_generator():
            try:
                current_offset = start
                async for chunk in client.iter_download(doc, offset=start, request_size=chunk_size):
                    chunk_len = len(chunk)
                    if current_offset + chunk_len > end + 1:
                        yield chunk[:(end + 1 - current_offset)]
                        break
                    yield chunk
                    current_offset += chunk_len
                    if current_offset > end:
                        break
            except Exception as stream_err:
                print(f"[Streamer Warning] Stream interrupted: {stream_err}")

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": mime_type,
            "Content-Disposition": f'inline; filename="{file_name}"',
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges"
        }

        status_code = 206 if range_header else 200
        return StreamingResponse(file_chunk_generator(), status_code=status_code, headers=headers)

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Streamer Error] Failed to stream: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/stream/{channel}/{message_id}")
async def stream_with_channel(channel: str, message_id: int, request: Request):
    return await stream_telegram_file(channel, message_id, request)

@app.get("/stream/{message_id}")
async def stream_default_channel(message_id: int, request: Request):
    return await stream_telegram_file(DEFAULT_CHANNEL, message_id, request)
