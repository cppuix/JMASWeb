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
            // The RTL Flip: Since 0% is on the right, 
            // we subtract the left-to-right position from 1.
            pos = 1 - pos;
            this.audioPlayer.currentTime = pos * this.audioPlayer.duration;
        });

        this.audioPlayer.addEventListener('timeupdate', () => this.updateProgress());
        this.audioPlayer.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audioPlayer.addEventListener('ended', () => this.handleAudioEnded());

        this.autoPlayNext.addEventListener('change', (e) =>
        {
            localStorage.setItem('autoPlayNext', e.target.checked);
        });

        document.getElementById('lessonSearch').addEventListener('input', (e) =>
        {
            const term = e.target.value.toLowerCase();
            const items = this.lessonsContainer.querySelectorAll('.lesson-item');

            items.forEach((item, index) =>
            {
                const title = this.lessons[index].title.toLowerCase();
                // Show/Hide based on match
                item.style.display = title.includes(term) ? 'flex' : 'none';
            });
        });

        document.getElementById('globalSearchInput').addEventListener('input', (e) =>
        {
            const term = e.target.value.toLowerCase();
            const resultsDiv = document.getElementById('globalSearchResults');

            // Checkboxes
            const useTitles = document.getElementById('searchTitles').checked;
            const useDesc = document.getElementById('searchDesc').checked;
            const useDates = document.getElementById('searchDates').checked;

            if (term.length < 2)
            {
                resultsDiv.innerHTML = '';
                return;
            }

            const matches = window.lessonPlayer.lessons.filter(l =>
            {
                const titleMatch = useTitles && l.title.toLowerCase().includes(term);
                const dateMatch = useDates && l.date?.includes(term);
                const descText = Array.isArray(l.description) ? l.description.join(' ') : (l.description || '');
                const descMatch = useDesc && descText.toLowerCase().includes(term);

                return titleMatch || dateMatch || descMatch;
            });

            resultsDiv.innerHTML = matches.map(l =>
            {
                // Build the "Found Info" snippet
                let foundSnippet = "";
                const descText = Array.isArray(l.description) ? l.description.join(' ') : (l.description || '');

                if (useDesc && descText.toLowerCase().includes(term))
                {
                    const idx = descText.toLowerCase().indexOf(term);
                    foundSnippet = `<p>...${descText.substring(idx - 20, idx + 40)}...</p>`;
                } else if (useDates && l.date?.includes(term))
                {
                    foundSnippet = `<p>التاريخ المطابق: ${l.date}</p>`;
                }

                return `
            <div class="search-result-card" onclick="window.lessonPlayer.loadLesson(${window.lessonPlayer.lessons.indexOf(l)}, true); toggleGlobalSearch();">
                <strong>${l.title}</strong>
                ${foundSnippet}
            </div>
        `;
            }).join('');
        });

        this.speedSelect.addEventListener('change', (e) =>
        {
            const speed = parseFloat(e.target.value);
            this.audioPlayer.playbackRate = speed;
            localStorage.setItem('playbackSpeed', speed); // Save it!
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
                <button class="download-btn" title="تحميل">⬇</button>
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

        // Handle Google Drive or Direct URL
        const fileId = lesson.url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
        this.audioPlayer.src = fileId ? `/api/audio?id=${fileId}` : lesson.url;

        this.audioPlayer.load();

        // re-apply the user's preferred speed
        this.audioPlayer.playbackRate = parseFloat(this.speedSelect.value);

        // UI Updates
        if (this.currentNum) this.currentNum.textContent = index + 1;
        this.descriptionList.innerHTML = Array.isArray(lesson.description)
            ? lesson.description.map(item => `<li>${item}</li>`).join('')
            : `<li>${lesson.description}</li>`;

        this.transcriptionContent.innerHTML = lesson.transcription || "لا يوجد نص متاح حالياً.";

        // Restore Progress
        if (this.progress[lesson.id])
        {
            this.audioPlayer.currentTime = this.progress[lesson.id];
        }

        localStorage.setItem('lastLessonId', lesson.id);
        this.updateLessonsListState();

        // Use Constants for Icon
        const iconPath = this.playPauseBtn.querySelector('path');
        if (shouldPlay)
        {
            this.audioPlayer.play().catch(e => console.log("Autoplay blocked"));
            iconPath.setAttribute('d', ICON_PAUSE);
        } else
        {
            iconPath.setAttribute('d', ICON_PLAY);
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
        if (this.audioPlayer.paused)
        {
            this.audioPlayer.play();
            iconPath.setAttribute('d', ICON_PAUSE);
        } else
        {
            this.audioPlayer.pause();
            iconPath.setAttribute('d', ICON_PLAY);
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
        if (this.autoPlayNext.checked)
        {
            this.playNextLesson();
        } else
        {
            // Just switch the path, don't overwrite the whole innerHTML
            const iconPath = this.playPauseBtn.querySelector('path');
            if (iconPath) iconPath.setAttribute('d', ICON_PLAY);
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

        const savedSpeed = localStorage.getItem('playbackSpeed');
        if (savedSpeed)
        {
            this.speedSelect.value = savedSpeed;
            this.audioPlayer.playbackRate = parseFloat(savedSpeed);
        }
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

function toggleAbout()
{
    const modal = document.getElementById('aboutModal');
    const isVisible = modal.style.display === 'flex';
    modal.style.display = isVisible ? 'none' : 'flex';
}

// Close modal if clicking outside the content box
window.onclick = function (event)
{
    const modal = document.getElementById('aboutModal');
    if (event.target == modal)
    {
        modal.style.display = "none";
    }
}

function toggleGlobalSearch()
{
    const modal = document.getElementById('searchModal');
    const input = document.getElementById('globalSearchInput');
    const isVisible = modal.style.display === 'flex';

    modal.style.display = isVisible ? 'none' : 'flex';

    if (!isVisible)
    {
        input.value = ''; // Clear previous search
        document.getElementById('globalSearchResults').innerHTML = '';
        setTimeout(() => input.focus(), 100);
    }
}