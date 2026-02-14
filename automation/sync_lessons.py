import os
import json
import re
import io
from telethon import TelegramClient
from telethon.sessions import StringSession  # Added this
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from google.oauth2 import service_account

# 1. Config from Secrets
api_id = os.environ['TG_API_ID']
api_hash = os.environ['TG_API_HASH']
tg_session = os.environ['TG_SESSION'] # New secret
creds_json = json.loads(os.environ['GOOGLE_CREDENTIALS'])
FOLDER_ID = '1cSIVl-xXpEuoXLmv3JbALUkZFOmJNBkf' 

# 2. Setup Clients
# Now using StringSession to bypass the login code requirement
tg_client = TelegramClient(StringSession(tg_session), api_id, api_hash)
drive_creds = service_account.Credentials.from_service_account_info(creds_json)
drive_service = build('drive', 'v3', credentials=drive_creds)

def parse_telegram_text(text):
    lesson_num_match = re.search(r"الدرس\s+(\d+)", text)
    lesson_id = int(lesson_num_match.group(1)) if lesson_num_match else None
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    title = next((l for l in lines if "كتاب" in l), lines[0] if lines else "درس جديد")
    date_str = next((l for l in lines if "144" in l), "")
    return {"id": lesson_id, "title": title, "description": lines, "date": date_str}

async def main():
    await tg_client.start()
    
    with open('lessons.json', 'r', encoding='utf-8') as f:
        lessons = json.load(f)
    
    last_id = max([l['id'] for l in lessons]) if lessons else 833

    # Limit=100 ensures we catch all 19 missing lessons (834-852)
    async for message in tg_client.iter_messages('@D_faisl', limit=100):
        if message.audio and message.text:
            parsed_data = parse_telegram_text(message.text)
            lesson_id = parsed_data["id"]

            if lesson_id and lesson_id > last_id:
                print(f"Syncing Lesson {lesson_id}...")
                
                # Download to memory
                audio_data = await message.download_media(file=bytes)
                
                # Upload to Drive
                file_metadata = {'name': f"Lesson_{lesson_id}.mp3", 'parents': [FOLDER_ID]}
                media = MediaIoBaseUpload(io.BytesIO(audio_data), mimetype='audio/mpeg')
                drive_file = drive_service.files().create(body=file_metadata, media_body=media, fields='id').execute()
                
                lessons.append({
                    "id": lesson_id,
                    "title": parsed_data["title"],
                    "url": drive_file.get('id'), 
                    "description": parsed_data["description"],
                    "date": parsed_data["date"]
                })

    lessons.sort(key=lambda x: x['id'])
    with open('lessons.json', 'w', encoding='utf-8') as f:
        json.dump(lessons, f, ensure_ascii=False, indent=4)
    print("All caught up!")

with tg_client:
    tg_client.loop.run_until_complete(main())