// Add these constants to the top of your script.js
const ICON_PLAY = "M8 5v14l11-7z"; 
const ICON_PAUSE = "M6 5h4v14H6zm8 0h4v14h-4z"; // Perfectly symmetrical pause bars
class LessonPlayer
{
    
    constructor()
    {
        // Core Elements
        this.audioPlayer = document.getElementById('audioPlayer');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.speedSelect = document.getElementById('speedSelect');
        this.skipBackBtn = document.getElementById('skipBackBtn');
        this.skipForwardBtn = document.getElementById('skipForwardBtn');
        this.autoPlayNext = document.getElementById('autoPlayNext');

        // Progress UI
        this.progressBar = document.querySelector('.progress');
        this.progressContainer = document.querySelector('.progress-bar');
        this.currentTimeSpan = document.getElementById('currentTime');
        this.durationSpan = document.getElementById('duration');

        // Content UI
        this.descriptionList = document.getElementById('descriptionList');
        this.transcriptionContent = document.getElementById('transcriptionContent');
        this.lessonsContainer = document.getElementById('lessonsContainer');

        // Counter UI (The new 5% row elements)
        this.currentNum = document.getElementById('currentNum');
        this.totalNum = document.getElementById('totalNum');

        // State
        this.currentLessonIndex = 0;
        this.lessons = [];
        this.progress = {};

        this.init();
    }

    async init()
    {
        this.setupEventListeners();
        this.loadProgress();
        await this.loadLessons();

        // Set total count in the 5% row
        if (this.totalNum) this.totalNum.textContent = this.lessons.length;

        this.createLessonsList();

        // Load saved or initial lesson
        const lastLessonId = localStorage.getItem('lastLessonId');
        let indexToLoad = 0;
        if (lastLessonId)
        {
            const foundIndex = this.lessons.findIndex(l => l.id == lastLessonId);
            if (foundIndex !== -1) indexToLoad = foundIndex;
        }
        this.loadLesson(indexToLoad, false);
    }

    setupEventListeners()
    {
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.prevBtn.addEventListener('click', () => this.playPreviousLesson());
        this.nextBtn.addEventListener('click', () => this.playNextLesson());

        this.speedSelect.addEventListener('change', (e) =>
        {
            this.audioPlayer.playbackRate = parseFloat(e.target.value);
        });

        this.skipBackBtn.addEventListener('click', () => this.skip(-5));
        this.skipForwardBtn.addEventListener('click', () => this.skip(5));

        this.progressContainer.addEventListener('click', (e) =>
        {
            const rect = this.progressContainer.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            this.audioPlayer.currentTime = pos * this.audioPlayer.duration;
        });

        this.audioPlayer.addEventListener('timeupdate', () => this.updateProgress());
        this.audioPlayer.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audioPlayer.addEventListener('ended', () => this.handleAudioEnded());

        this.autoPlayNext.addEventListener('change', (e) =>
        {
            localStorage.setItem('autoPlayNext', e.target.checked);
        });
    }

    async loadLessons()
    {
        try
        {
            const response = await fetch('lessons.json');
            const data = await response.json();
            this.lessons = data.map((lesson, index) => ({
                ...lesson,
                id: lesson.id || (index + 1)
            }));
        } catch (error)
        {
            console.error('Failed to load lessons.json:', error);
            this.lessons = [];
        }
    }

    createLessonsList()
    {
        this.lessonsContainer.innerHTML = '';
        this.lessons.forEach((lesson, index) =>
        {
            const lessonElement = document.createElement('div');
            lessonElement.className = 'lesson-item';

            const progressInfo = this.progress[lesson.id] ?
                `استأنف من: ${this.formatTime(this.progress[lesson.id])}` : 'لم يبدأ بعد';

            lessonElement.innerHTML = `
                <div class="lesson-info">
                    <h4>${lesson.title}</h4>
                    <p class="progress-info">${progressInfo}</p>
                </div>
                <button class="close-modal" title="تحميل">⬇</button>
            `;

            lessonElement.querySelector('.download-btn').addEventListener('click', (e) =>
            {
                e.stopPropagation();
                window.open(lesson.url, '_blank');
            });

            lessonElement.addEventListener('click', () => this.loadLesson(index, true));
            this.lessonsContainer.appendChild(lessonElement);
        });
    }

    loadLesson(index, shouldPlay = true)
    {
        if (index < 0 || index >= this.lessons.length) return;

        this.currentLessonIndex = index;
        const lesson = this.lessons[index];

        // 1. Google Drive Proxy Logic
        if (lesson.url && lesson.url.includes('drive.google.com'))
        {
            // This regex looks for 'id=' and grabs everything after it until the end or an ampersand
            const match = lesson.url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
            if (match && match[1])
            {
                const fileId = match[1];
                this.audioPlayer.src = `/api/audio?id=${fileId}`;
            } else
            {
                this.audioPlayer.src = lesson.url;
            }
        } else
        {
            this.audioPlayer.src = lesson.url;
        }

        this.audioPlayer.preload = "auto";
        this.audioPlayer.load();

        // Update UI Text
        if (this.currentNum) this.currentNum.textContent = index + 1;

        // Update Description (Handles arrays or strings)
        if (Array.isArray(lesson.description))
        {
            this.descriptionList.innerHTML = lesson.description.map(item => `<li>${item}</li>`).join('');
        } else
        {
            this.descriptionList.innerHTML = `<li>${lesson.description}</li>`;
        }

        this.transcriptionContent.innerHTML = lesson.transcription || "لا يوجد نص متاح حالياً.";

        // Restore Progress
        if (this.progress[lesson.id])
        {
            this.audioPlayer.currentTime = this.progress[lesson.id];
        }

        localStorage.setItem('lastLessonId', lesson.id);
        this.updateLessonsListState();

        const iconPath = this.playPauseBtn.querySelector('path');
        if (shouldPlay)
        {
            this.audioPlayer.play().catch(e => console.log("Playback failed:", e));
            iconPath.setAttribute('d', "M6 5h4v14H6zm8 0h4v14h-4z");
        } else
        {
            iconPath.setAttribute('d', "M8 5v14l11-7z");
        }
    }

    updateLessonsListState()
    {
        const items = this.lessonsContainer.querySelectorAll('.lesson-item');
        items.forEach((item, idx) =>
        {
            item.classList.toggle('active', idx === this.currentLessonIndex);
        });
    }

    togglePlayPause()
    {
        const iconPath = this.playPauseBtn.querySelector('path');

        if (this.audioPlayer.paused) {
            this.audioPlayer.play();
            // Set to PAUSE icon
            iconPath.setAttribute('d', "M6 5h4v14H6zm8 0h4v14h-4z");
        } else {
            this.audioPlayer.pause();
            // Set to PLAY icon
            iconPath.setAttribute('d', "M8 5v14l11-7z");
        }
    }

    playPreviousLesson()
    {
        if (this.currentLessonIndex > 0) this.loadLesson(this.currentLessonIndex - 1, true);
    }

    playNextLesson()
    {
        if (this.currentLessonIndex < this.lessons.length - 1) this.loadLesson(this.currentLessonIndex + 1, true);
    }

    skip(seconds)
    {
        this.audioPlayer.currentTime = Math.max(0, this.audioPlayer.currentTime + seconds);
    }

    updateProgress()
    {
        if (!this.audioPlayer.duration) return;
        const percent = (this.audioPlayer.currentTime / this.audioPlayer.duration) * 100;
        this.progressBar.style.width = `${percent}%`;
        this.currentTimeSpan.textContent = this.formatTime(this.audioPlayer.currentTime);

        const currentId = this.lessons[this.currentLessonIndex]?.id;
        if (currentId)
        {
            this.progress[currentId] = this.audioPlayer.currentTime;
            localStorage.setItem('lessonProgress', JSON.stringify(this.progress));
        }
    }

    updateDuration()
    {
        this.durationSpan.textContent = this.formatTime(this.audioPlayer.duration);
    }

    handleAudioEnded()
    {
        const iconPath = this.playPauseBtn.querySelector('path');
        if (this.autoPlayNext.checked)
        {
            this.playNextLesson();
        } else
        {
            this.playPauseBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>`;
            iconPath.setAttribute('d', "M8 5v14l11-7z");
        }
    }

    formatTime(seconds)
    {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    loadProgress()
    {
        const saved = localStorage.getItem('lessonProgress');
        if (saved) this.progress = JSON.parse(saved);
        const auto = localStorage.getItem('autoPlayNext');
        if (auto !== null) this.autoPlayNext.checked = auto === 'true';
    }
}

// Global UI Handlers
function toggleSidebar()
{
    document.getElementById('sidebar').classList.toggle('open');
}

function switchTab(evt, tabId)
{
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    evt.currentTarget.classList.add('active');
}

// Initialize on Load
document.addEventListener('DOMContentLoaded', () =>
{
    window.lessonPlayer = new LessonPlayer();
});

// Auto-close sidebar on mobile after selection
document.addEventListener('click', (e) =>
{
    if (window.innerWidth < 900 && e.target.closest('.lesson-item') && !e.target.closest('.download-btn'))
    {
        toggleSidebar();
    }
});

// ABOUT MODAL

function toggleAbout() {
    const modal = document.getElementById('aboutModal');
    const isVisible = modal.style.display === 'flex';
    modal.style.display = isVisible ? 'none' : 'flex';
}

// Close modal if clicking outside the content box
window.onclick = function(event) {
    const modal = document.getElementById('aboutModal');
    if (event.target == modal) {
        modal.style.display = "none";
    }
}