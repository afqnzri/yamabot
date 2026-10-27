# Cloudflare & Python Deployment Guide for YAMA Bot

This guide explains how to deploy the **YAMA Bot Hybrid System**:
1. **Frontend Web Dashboard** → Deployed to **Cloudflare Pages** (Free, Global CDN, instant SSL).
2. **Automated Recurring Price Extraction (Flow 2)** → Automated via **GitHub Actions Cron** (100% free) or any server.

---

## Part 1: Deploy Web App to Cloudflare Pages

The web application is built with Vite + React + Tailwind CSS and compiles to a static bundle (`dist/`). It runs seamlessly on Cloudflare Pages without any server maintenance.

### Method A: Git Integration (Recommended - Continuous Deployment)
1. Push this codebase to your GitHub/GitLab repository.
2. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/) and navigate to **Workers & Pages** > **Pages** > **Connect to Git**.
3. Select your repository.
4. Configure the build settings:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Node.js Version**: (in Environment variables, add `NODE_VERSION`: `20`)
5. Click **Save and Deploy**. Cloudflare will build and host your web app on a fast `.pages.dev` domain with automatic HTTPS!

### Method B: Direct Upload via Wrangler CLI
If you prefer not using Git:
```bash
npm install -g wrangler
npm run build
wrangler pages deploy dist --project-name=yama-bot
```

---

## Part 2: Automated Daily Monitoring with Telegram Alerts

For 24/7 automated price monitoring without keeping your computer on:

### Option 1: GitHub Actions (100% Free, Zero Infrastructure)
We included a pre-configured workflow at `.github/workflows/daily_price_monitor.yml`.
1. Go to your GitHub repository **Settings** > **Secrets and variables** > **Actions**.
2. Add the following repository secrets:
   - `RAPIDAPI_KEY`: Your RapidAPI subscription key for Booking.com.
   - `TELEGRAM_BOT_TOKEN`: Token from [@BotFather](https://t.me/botfather).
   - `TELEGRAM_CHAT_ID`: Your Telegram personal or group chat ID.
3. The workflow will automatically run every day, extract competitor prices, calculate lowest and average rates, generate the dated `.xlsx` output workbook, and send the report directly to your Telegram!

### Option 2: Running on your own computer or server (cron)
1. Install Python 3.10+:
   ```bash
   pip install -r yama_bot/requirements.txt
   ```
2. Create a `.env` file:
   ```env
   RAPIDAPI_KEY=your_rapidapi_key_here
   RAPIDAPI_HOST=booking-com15.p.rapidapi.com
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   TELEGRAM_CHAT_ID=your_chat_id_here
   ```
3. Run Flow 1 (Initial Setup):
   ```bash
   python -m yama_bot.flow1_setup --hotel "MSP D'Spark Hotel Bayu" --competitors "Premiere Hotel Klang" "Crystal Crown Hotel Klang"
   ```
4. Run Flow 2 (Price Extraction):
   ```bash
   python -m yama_bot.flow2_extract --input "MSP D'Spark Hotel Bayu.xlsx" --arrival "2026-11-01" --departure "2026-11-02" --telegram
   ```
5. Set up a Linux cron job:
   ```cron
   0 8 * * * cd /path/to/project && /usr/bin/python3 -m yama_bot.flow2_extract --input "MSP D'Spark Hotel Bayu.xlsx" --telegram >> /var/log/yama.log 2>&1
   ```
