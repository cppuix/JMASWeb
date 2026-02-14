import os
import json
import re
import io
from telethon import TelegramClient
from telethon.sessions import StringSession
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from google.oauth2 import service_account

# 1. Config
api_id = os.environ['TG_API_ID']
api_hash = os.environ['TG_API_HASH']
tg_session = os.environ['TG_SESSION']
creds_json = json.loads(os.environ['GOOGLE_CREDENTIALS'])
FOLDER_ID = '1cSIVl-xXpEuoXLmv3JbALUkZFOmJNBkf'

# 2. Clients
tg_client = TelegramClient(StringSession(tg_session), api_id, api_hash)
drive_creds = service_account.Credentials.from_service_account_info(creds_json)
drive_service = build('drive', 'v3', credentials=drive_creds)

def get_drive_file_id(filename):
    """Returns file ID if exists in the folder, else None."""
    query = f"name = '{filename}' and '{FOLDER_ID}' in parents and trashed = false"
    results = drive_service.files().list(q=query, fields="files(id)").execute()
    files = results.get('files', [])
    return files[0]['id'] if files else None

def parse_telegram_text(text):
    lesson_num_match = re.search(r"الدرس\s+(\d+)", text)
    lesson_id = int(lesson_num_match.group(1)) if lesson_num_match else None
    
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    # Title logic: Use first line as title to match your example format
    title = f"الدرس {lesson_id}" if lesson_id else lines[0]
    
    # Description logic: Join with <br>
    description_html = " <br> ".join(lines)
    
    date_str = next((l for l in lines if "144" in l), "")
    
    return {
        "id": lesson_id,
        "title": title,
        "description": description_html,
        "date": date_str
    }

async def main():
    await tg_client.start()
    
    # Load JSON
    with open('lessons.json', 'r', encoding='utf-8') as f:
        lessons = json.load(f)
    
    # Set this to 782 manually for your reconstruction run
    # After this run, change it back to: max([l['id'] for l in lessons])
    last_id = 782 

    # We need a higher limit to go back from 852 to 782 (~70 lessons)
    async for message in tg_client.iter_messages('@D_faisl', limit=350):
        if message.audio and message.text:
            parsed_data = parse_telegram_text(message.text)
            lesson_id = parsed_data["id"]

            if lesson_id and lesson_id > last_id:
                # Check if JSON already has this ID to avoid duplicates
                if any(l['id'] == lesson_id for l in lessons):
                    continue

                filename = f"الدرس {lesson_id}.mp3"
                print(f"Processing Lesson {lesson_id}...")
                
                # Check Google Drive first
                file_id = get_drive_file_id(filename)
                
                if not file_id:
                    print(f"Uploading {filename} to Drive...")
                    audio_data = await message.download_media(file=bytes)
                    file_metadata = {'name': filename, 'parents': [FOLDER_ID]}
                    media = MediaIoBaseUpload(io.BytesIO(audio_data), mimetype='audio/mpeg')
                    drive_file = drive_service.files().create(body=file_metadata, media_body=media, fields='id').execute()
                    file_id = drive_file.get('id')
                else:
                    print(f"File {filename} already exists in Drive. Skipping upload.")

                # Add to JSON list
                lessons.append({
                    "id": lesson_id,
                    "title": parsed_data["title"],
                    "file": filename,
                    "description": parsed_data["description"],
                    "date": parsed_data["date"],
                    "url": f"https://drive.google.com/uc?export=download&id={file_id}"
                })

    # Final Sort and Save
    lessons.sort(key=lambda x: x['id'])
    with open('lessons.json', 'w', encoding='utf-8') as f:
        json.dump(lessons, f, ensure_ascii=False, indent=4)
    print("All caught up and JSON reconstructed!")

with tg_client:
    tg_client.loop.run_until_complete(main())