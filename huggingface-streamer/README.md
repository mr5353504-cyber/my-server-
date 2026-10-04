---
title: Telegram Video Streamer Engine
emoji: 🎬
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# 🚀 Telegram High-Speed Video Streamer for Hugging Face Spaces

This service streams large video files (up to 4GB) directly from your Telegram channel to your movie website HTML5 video player with HTTP Range (206 Partial Content) support, completely bypassing Telegram's 20MB web embed limit.

## 🔑 Environment Variables to Add in Hugging Face Space Settings:
- `API_ID`: Your Telegram API ID from https://my.telegram.org
- `API_HASH`: Your Telegram API Hash from https://my.telegram.org
- `BOT_TOKEN`: Your Telegram Bot Token from @BotFather
- `CHANNEL`: Your channel username without @ (e.g. `server7766`)
