class LessonPlayer
{
    constructor()
    {
        // Elements
        this.audioPlayer = document.getElementById('audioPlayer');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.speedSelect = document.getElementById('speedSelect');
        this.skipBackBtn = document.getElementById('skipBackBtn');
        this.skipForwardBtn = document.getElementById('skipForwardBtn');
        this.autoPlayNext = document.getElementById('autoPlayNext');
        this.progressBar = document.querySelector('.progress');
        this.progressContainer = document.querySelector('.progress-bar');
        this.currentTimeSpan = document.getElementById('currentTime');
        this.durationSpan = document.getElementById('duration');
        this.lessonTitle = document.getElementById('lessonTitle');
        this.descriptionList = document.getElementById('descriptionList');
        this.transcriptionContent = document.getElementById('transcriptionContent');
        this.lessonsContainer = document.getElementById('lessonsContainer');

        this.currentLessonIndex = 0;
        this.lessons = [];
        this.progress = {};

        this.init();
    }

    async init()
    {
        this.setupEventListeners();
        this.loadProgress();
        await this.loadLessons(); // Wait for JSON to load
        this.createLessonsList();

        // Load saved or initial lesson
        const lastLessonId = localStorage.getItem('lastLessonId');
        let indexToLoad = 0;
        if (lastLessonId)
        {
            const foundIndex = this.lessons.findIndex(l => l.id == lastLessonId);
            if (foundIndex !== -1) indexToLoad = foundIndex;
        }
        this.loadLesson(indexToLoad, false); // false = don't auto-play on start
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
            // Map data and ensure IDs exist
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
            if (index === this.currentLessonIndex) lessonElement.classList.add('active');

            const progressInfo = this.progress[lesson.id] ?
                `التقدم: ${this.formatTime(this.progress[lesson.id])}` : '';

            lessonElement.innerHTML = `
                <h4>${lesson.title}</h4>
                <div class="progress-info">${progressInfo}</div>
                <button class="download-btn">تحميل الصوتية</button>
            `;

            lessonElement.querySelector('.download-btn').addEventListener('click', (e) =>
            {
                e.stopPropagation();
                this.downloadLesson(lesson.id);
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

        // Check if it's a Google Drive link
        if (lesson.url.includes('drive.google.com'))
        {
            const fileId = lesson.url.match(/id=([a-zA-Z0-9_-]+)/)[1];
            // Use your NEW serverless proxy
            this.audioPlayer.src = `/api/audio?id=${fileId}`;
        } else
        {
            this.audioPlayer.src = lesson.url;
        }
        this.audioPlayer.load(); // Force reload the new source

        // Update UI
        this.lessonTitle.textContent = lesson.title;
        this.descriptionList.innerHTML = `<li>${lesson.description}</li>`;
        this.transcriptionContent.textContent = lesson.transcription || "لا يوجد نص متاح حالياً.";

        // Load progress
        if (this.progress[lesson.id])
        {
            this.audioPlayer.currentTime = this.progress[lesson.id];
        }

        localStorage.setItem('lastLessonId', lesson.id);
        this.updateLessonsList();

        if (shouldPlay)
        {
            this.audioPlayer.play().catch(e => console.log("Autoplay blocked or failed:", e));
            this.playPauseBtn.textContent = '⏸️';
        } else
        {
            this.playPauseBtn.textContent = '▶️';
        }
    }

    updateLessonsList()
    {
        const items = this.lessonsContainer.querySelectorAll('.lesson-item');
        items.forEach((item, idx) =>
        {
            item.classList.toggle('active', idx === this.currentLessonIndex);
        });
    }

    togglePlayPause()
    {
        if (this.audioPlayer.paused)
        {
            this.audioPlayer.play();
            this.playPauseBtn.textContent = '⏸️';
        } else
        {
            this.audioPlayer.pause();
            this.playPauseBtn.textContent = '▶️';
        }
    }

    playPreviousLesson()
    {
        if (this.currentLessonIndex > 0)
        {
            this.loadLesson(this.currentLessonIndex - 1, true);
        }
    }

    playNextLesson()
    {
        if (this.currentLessonIndex < this.lessons.length - 1)
        {
            this.loadLesson(this.currentLessonIndex + 1, true);
        }
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

        // Save current progress
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
        if (this.autoPlayNext.checked)
        {
            this.playNextLesson();
        } else
        {
            this.playPauseBtn.textContent = '▶️';
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

    downloadLesson(lessonId)
    {
        const lesson = this.lessons.find(l => l.id === lessonId);
        if (lesson)
        {
            window.open(lesson.url, '_blank');
        }
    }
}

// Global init
document.addEventListener('DOMContentLoaded', () =>
{
    window.lessonPlayer = new LessonPlayer();
});