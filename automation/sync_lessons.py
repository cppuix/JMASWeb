import os
import json
import re
import io
from telethon import TelegramClient
from telethon.sessions import StringSession
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

# 1. Config
api_id = os.environ['TG_API_ID']
api_hash = os.environ['TG_API_HASH']
tg_session = os.environ['TG_SESSION']
FOLDER_ID = '1cSIVl-xXpEuoXLmv3JbALUkZFOmJNBkf'

# 2. Setup Google Drive with User Credentials (OAuth)
creds_info = {
    "client_id": os.environ['GOOGLE_CLIENT_ID'],
    "client_secret": os.environ['GOOGLE_CLIENT_SECRET'],
    "refresh_token": os.environ['GOOGLE_REFRESH_TOKEN'],
    "token_uri": "https://oauth2.googleapis.com/token",
}

creds = Credentials.from_authorized_user_info(creds_info)

# Refresh token if expired
if creds.expired:
    creds.refresh(Request())

drive_service = build('drive', 'v3', credentials=creds)

# 3. Setup Telegram
tg_client = TelegramClient(StringSession(tg_session), api_id, api_hash)

def get_drive_file_id(filename):
    query = f"name = '{filename}' and '{FOLDER_ID}' in parents and trashed = false"
    results = drive_service.files().list(q=query, fields="files(id)").execute()
    files = results.get('files', [])
    return files[0]['id'] if files else None

def parse_telegram_text(text):
    lesson_num_match = re.search(r"الدرس\s+(\d+)", text)
    lesson_id = int(lesson_num_match.group(1)) if lesson_num_match else None
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    title = f"الدرس {lesson_id}" if lesson_id else lines[0]
    description_html = " <br> ".join(lines)
    date_str = next((l for l in lines if "144" in l), "")
    return {"id": lesson_id, "title": title, "description": description_html, "date": date_str}

def get_num_from_title(title_str):
    match = re.search(r"(\d+)", str(title_str))
    return int(match.group(1)) if match else 0

async def main():
    await tg_client.start()
    with open('lessons.json', 'r', encoding='utf-8') as f:
        lessons = json.load(f)
    
    last_id = 782 

    async for message in tg_client.iter_messages('@D_faisl', limit=350):
        if message.audio and message.text:
            parsed_data = parse_telegram_text(message.text)
            lesson_id = parsed_data["id"]

            if lesson_id and lesson_id > last_id:
                if any(get_num_from_title(l.get('title')) == lesson_id for l in lessons):
                    continue

                filename = f"الدرس {lesson_id}.mp3"
                print(f"Processing Lesson {lesson_id}...")
                
                file_id = get_drive_file_id(filename)
                
                if not file_id:
                    print(f"Uploading {filename} to Drive...")
                    audio_data = await message.download_media(file=bytes)
                    file_metadata = {'name': filename, 'parents': [FOLDER_ID]}
                    media = MediaIoBaseUpload(io.BytesIO(audio_data), mimetype='audio/mpeg')
                    
                    drive_file = drive_service.files().create(
                        body=file_metadata, 
                        media_body=media, 
                        fields='id'
                    ).execute()
                    file_id = drive_file.get('id')
                else:
                    print(f"File {filename} exists. Skipping upload.")

                lessons.append({
                    "title": f"الدرس {lesson_id}",
                    "file": filename,
                    "description": parsed_data["description"],
                    "date": parsed_data["date"],
                    "url": f"https://drive.google.com/uc?export=download&id={file_id}"
                })

    lessons.sort(key=lambda x: get_num_from_title(x.get('title')))
    with open('lessons.json', 'w', encoding='utf-8') as f:
        json.dump(lessons, f, ensure_ascii=False, indent=4)
    print("Reconstruction complete!")

with tg_client:
    tg_client.loop.run_until_complete(main())