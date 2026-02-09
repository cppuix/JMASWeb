class LessonPlayer {
    constructor() {
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
    
    init() {
        this.setupEventListeners();
        this.loadLessons();
        this.loadProgress();
        this.createLessonsList();
        // Load lesson 0 or saved lesson if it exists
        const lastLessonId = localStorage.getItem('lastLessonId');
        if (lastLessonId && this.progress[lastLessonId]) {
            const lessonIndex = this.lessons.findIndex(lesson => lesson.id == lastLessonId);
            if (lessonIndex !== -1) {
                this.loadLesson(lessonIndex);
            } else {
                this.loadLesson(0);
            }
        } else {
            this.loadLesson(0);
        }
    }
    
    setupEventListeners() {
        // Audio player controls
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.prevBtn.addEventListener('click', () => this.playPreviousLesson());
        this.nextBtn.addEventListener('click', () => this.playNextLesson());
        
        // Speed control
        this.speedSelect.addEventListener('change', (e) => {
            this.audioPlayer.playbackRate = parseFloat(e.target.value);
        });
        
        // Skip controls
        this.skipBackBtn.addEventListener('click', () => this.skip(-5));
        this.skipForwardBtn.addEventListener('click', () => this.skip(5));
        
        // Progress bar
        this.progressContainer.addEventListener('click', (e) => {
            const rect = this.progressContainer.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            this.audioPlayer.currentTime = pos * this.audioPlayer.duration;
        });
        
        // Audio events
        this.audioPlayer.addEventListener('timeupdate', () => this.updateProgress());
        this.audioPlayer.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audioPlayer.addEventListener('ended', () => this.handleAudioEnded());
        
        // Auto-play next lesson
        this.autoPlayNext.addEventListener('change', (e) => {
            localStorage.setItem('autoPlayNext', e.target.checked);
        });
    }
    
    async loadLessons() {
        try {
            // For local development, we'll use a simpler approach
            // In production, you'd use a proper server
            this.lessons = this.generateLessonsFromUserInput();
        } catch (error) {
            console.error('Error loading lessons:', error);
            this.lessons = this.generateFallbackLessons();
        }
    }
    
    generateLessonsFromUserInput() {
        // This would ideally be loaded from your JSON file
        // For now, let's create a structure that matches your JSON format
        return [
            {
                id: 1,
                title: "الدرس 1",
                url: "https://drive.google.com/uc?export=download&id=12bHRBsr64ueXIse3MJGDzWAcl-lDqtkG",
                description: [
                    "ما هو كلام أهل العلم في بيان عظمة شأن حديث جبريل الطويل؟",
                    "من هو الذي قال عن هذا الحديث أنه اصل الإسلام؟",
                    "من هو الذي سمى هذا الحديث أم السنة؟",
                    "من هو أحسن من شرح هذا الحديث؟",
                    "هناك روايات غير التي في صحيح مسلم وفيها زيادات لها فوائد اذكر بعضها؟ منها أن النبي صلى الله عليه وسلم كان بارزا للناس ومنها أن جبريل عليه الصلاة والسلام سلم ورد عليه النبي صلى الله عليه وسلم",
                    "كيف عرف عمر رضي الله عنه أن هذا الرجل لا يعرفه أحد من الصحابة؟",
                    "ماذا نستفيد من قوله صدقت عندما سأل النبي صلى الله عليه وسلم وأجابه؟"
                ],
                transcription: "",
                date: "5 محرم 1445 هجري",
                originalFile: "الدرس 1.mp3"
            },
            {
                id: 2,
                title: "الدرس 2",
                url: "https://drive.google.com/uc?export=download&id=1TfNIv2_Hn6RA4a6nhKNnWBBI-LdxnvCb",
                description: [
                    "ما هو كلام أهل العلم في بيان عظمة شأن حديث جبريل الطويل؟",
                    "من هو الذي قال عن هذا الحديث أنه اصل الإسلام؟",
                    "من هو الذي سمى هذا الحديث أم السنة؟",
                    "من هو أحسن من شرح هذا الحديث؟",
                    "هناك روايات غير التي في صحيح مسلم وفيها زيادات لها فوائد اذكر بعضها؟ منها أن النبي صلى الله عليه وسلم كان بارزا للناس ومنها أن جبريل عليه الصلاة والسلام سلم ورد عليه النبي صلى الله عليه وسلم",
                    "كيف عرف عمر رضي الله عنه أن هذا الرجل لا يعرفه أحد من الصحابة؟",
                    "ماذا نستفيد من قوله صدقت عندما سأل النبي صلى الله عليه وسلم وأجابه؟"
                ],
                transcription: "",
                date: "6 محرم 1445 هجري",
                originalFile: "الدرس 2.mp3"
            },
            {
                id: 3,
                title: "الدرس 3",
                url: "https://drive.google.com/uc?export=download&id=1TfNIv2_Hn6RA4a6nhKNnWBBI-LdxnvCb",
                description: [
                    "ما معنى كلمة أشهد؟",
                    "أيهما أقوى الشهادة أم الإقرار؟",
                    "هل ينفع إقرار القلب لوحده؟",
                    "هل ينفع نطق اللسان لوحده؟",
                    "الناس لهم تفسيرات كثيرة لمعنى لا إله إلا الله فما هو المعنى الصحيح لها؟",
                    "اذكر بعض هذه التفسيرات التي ليست صحيحة؟"
                ],
                transcription: "",
                date: "7 محرم 1445 هجري",
                originalFile: "الدرس 3.mp3"
            }
        ];
    }
    
    generateFallbackLessons() {
        const fallbackLessons = [];
        for (let i = 1; i <= 10; i++) {
            fallbackLessons.push({
                id: i,
                title: `الدرس ${i}`,
                url: `https://archive.org/download/dorosJami3MasailElAkida/%D8%A7%D9%84%D8%AF%D8%B1%D8%B3%20${i}.mp3`,
                description: [
                    'نقاط مهمة من الدرس',
                    'توضيح للمفاهيم الأساسية',
                    'أمثلة عملية للتطبيق',
                    'خلاصة الدرس الرئيسية'
                ],
                transcription: 'نص الدرس سيتم إضافته هنا...',
                date: '',
                originalFile: `الدرس ${i}.mp3`
            });
        }
        return fallbackLessons;
    }
    
    // Convert Google Drive URL to direct download URL
    convertGoogleDriveUrl(url) {
        if (url.includes('drive.google.com')) {
            // Extract file ID from Google Drive URL
            const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (fileIdMatch) {
                const fileId = fileIdMatch[1];
                // Use docs.google.com/uc for audio playback
                return `https://docs.google.com/uc?export=download&id=${fileId}`;
            }
        }
        return url;
    }
    
    createLessonsList() {
        this.lessonsContainer.innerHTML = '';
        
        this.lessons.forEach((lesson, index) => {
            const lessonElement = document.createElement('div');
            lessonElement.className = 'lesson-item';
            if (index === this.currentLessonIndex) {
                lessonElement.classList.add('active');
            }
            
            const progressInfo = this.progress[lesson.id] ? 
                `التقدم: ${this.formatTime(this.progress[lesson.id])}` : '';
            
            lessonElement.innerHTML = `
                <h4>${lesson.title}</h4>
                <div class="progress-info">${progressInfo}</div>
                <button class="download-btn" onclick="lessonPlayer.downloadLesson(${lesson.id})">تحميل الصوتية</button>
            `;
            
            lessonElement.addEventListener('click', (e) => {
                if (!e.target.classList.contains('download-btn')) {
                    this.loadLesson(index);
                }
            });
            
            this.lessonsContainer.appendChild(lessonElement);
        });
    }
    
    loadLesson(index) {
        if (index < 0 || index >= this.lessons.length) return;
        
        this.currentLessonIndex = index;
        const lesson = this.lessons[index];
        
        // Handle Google Drive URLs with better approach
        let audioUrl = lesson.url;
        if (lesson.url.includes('drive.google.com')) {
            // For Google Drive, use the direct URL format
            audioUrl = this.convertGoogleDriveUrl(lesson.url);
            
            // Set additional headers for Google Drive audio
            const audio = this.audioPlayer;
            audio.crossOrigin = "anonymous";
            
            // Try to load with a fetch approach for better compatibility
            this.loadAudioWithFetch(audioUrl, lesson);
        } else {
            // For regular URLs, load normally
            this.audioPlayer.src = audioUrl;
        }
        
        // Update UI
        this.lessonTitle.textContent = lesson.title;
        this.updateDescription(lesson.description);
        this.updateTranscription(lesson.transcription);
        this.updateLessonsList();
        
        // Load saved progress
        if (this.progress[lesson.id]) {
            this.audioPlayer.currentTime = this.progress[lesson.id];
        }
        
        // Save last lesson ID
        localStorage.setItem('lastLessonId', lesson.id);
        
        // Play automatically if user prefers
        if (this.audioPlayer.paused) {
            this.playPauseBtn.textContent = '▶️';
        }
    }
    
    async loadAudioWithFetch(url, lesson) {
        try {
            // Create a blob from the fetched audio
            const response = await fetch(url);
            const blob = await response.blob();
            const audioUrl = URL.createObjectURL(blob);
            
            // Set the audio source to the blob URL
            this.audioPlayer.src = audioUrl;
            
            // Clean up the blob URL when done
            this.audioPlayer.addEventListener('ended', () => {
                URL.revokeObjectURL(audioUrl);
            });
        } catch (error) {
            console.error('Error loading Google Drive audio:', error);
            // Fallback to direct URL
            this.audioPlayer.src = this.convertGoogleDriveUrl(lesson.url);
        }
    }
    
    updateDescription(description) {
        this.descriptionList.innerHTML = '';
        if (Array.isArray(description)) {
            description.forEach(point => {
                const li = document.createElement('li');
                li.innerHTML = point; // Use innerHTML to preserve HTML formatting
                this.descriptionList.appendChild(li);
            });
        } else {
            // Handle case where description is a single string with HTML
            const li = document.createElement('li');
            li.innerHTML = description;
            this.descriptionList.appendChild(li);
        }
    }
    
    updateTranscription(transcription) {
        this.transcriptionContent.textContent = transcription;
    }
    
    updateLessonsList() {
        const lessonItems = document.querySelectorAll('.lesson-item');
        lessonItems.forEach((item, index) => {
            item.classList.toggle('active', index === this.currentLessonIndex);
        });
    }
    
    togglePlayPause() {
        if (this.audioPlayer.paused) {
            this.audioPlayer.play();
            this.playPauseBtn.textContent = '⏸️';
        } else {
            this.audioPlayer.pause();
            this.playPauseBtn.textContent = '▶️';
        }
    }
    
    playPreviousLesson() {
        if (this.currentLessonIndex > 0) {
            this.loadLesson(this.currentLessonIndex - 1);
            this.audioPlayer.play();
            this.playPauseBtn.textContent = '⏸️';
        }
    }
    
    playNextLesson() {
        if (this.currentLessonIndex < this.lessons.length - 1) {
            this.loadLesson(this.currentLessonIndex + 1);
            this.audioPlayer.play();
            this.playPauseBtn.textContent = '⏸️';
        }
    }
    
    skip(seconds) {
        this.audioPlayer.currentTime = Math.max(0, this.audioPlayer.currentTime + seconds);
    }
    
    updateProgress() {
        const progress = (this.audioPlayer.currentTime / this.audioPlayer.duration) * 100;
        this.progressBar.style.width = `${progress}%`;
        this.currentTimeSpan.textContent = this.formatTime(this.audioPlayer.currentTime);
        
        // Save progress
        const currentLesson = this.lessons[this.currentLessonIndex];
        if (currentLesson) {
            this.progress[currentLesson.id] = this.audioPlayer.currentTime;
            this.saveProgress();
            this.updateLessonsList();
        }
    }
    
    updateDuration() {
        this.durationSpan.textContent = this.formatTime(this.audioPlayer.duration);
    }
    
    handleAudioEnded() {
        this.playPauseBtn.textContent = '▶️';
        
        if (this.autoPlayNext.checked && this.currentLessonIndex < this.lessons.length - 1) {
            this.playNextLesson();
        }
    }
    
    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    saveProgress() {
        localStorage.setItem('lessonProgress', JSON.stringify(this.progress));
    }
    
    loadProgress() {
        const saved = localStorage.getItem('lessonProgress');
        if (saved) {
            this.progress = JSON.parse(saved);
        }
        
        const autoPlay = localStorage.getItem('autoPlayNext');
        if (autoPlay !== null) {
            this.autoPlayNext.checked = autoPlay === 'true';
        }
    }
    
    downloadLesson(lessonId) {
        const lesson = this.lessons.find(l => l.id === lessonId);
        if (lesson) {
            if (lesson.url.includes('drive.google.com')) {
                // Extract file ID and create proper download URL
                const fileIdMatch = lesson.url.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (fileIdMatch) {
                    const fileId = fileIdMatch[1];
                    const downloadUrl = `https://drive.google.com/uc?authuser=0&id=${fileId}&export=download`;
                    window.open(downloadUrl, '_blank');
                }
            } else {
                // For regular URLs, use download link
                const link = document.createElement('a');
                link.href = lesson.url;
                link.download = lesson.originalFile || `${lesson.title}.mp3`;
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        }
    }
}

// Initialize the lesson player when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.lessonPlayer = new LessonPlayer();
});