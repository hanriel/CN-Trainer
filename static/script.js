const TRAINING_STORAGE_KEY = 'networkTrainingProgress';

// Глобальное состояние
let currentMode = 'training';
let allTickets = [];
let currentTicket = null;
let currentQuestionIndex = 0;
let examData = null;
let examAnswered = {};
let examErrorCount = 0;

// DOM элементы
const trainingSection = document.getElementById('training-section');
const examSection = document.getElementById('exam-section');
const modeTrainingBtn = document.getElementById('mode-training');
const modeExamBtn = document.getElementById('mode-exam');
const ticketListDiv = document.getElementById('ticket-list');
const trainingQuestionsDiv = document.getElementById('training-questions');
const startExamBtn = document.getElementById('start-exam-btn');
const examInfoDiv = document.getElementById('exam-info');
const examQuestionsDiv = document.getElementById('exam-questions');
const examResultDiv = document.getElementById('exam-result');

// ---------- Вспомогательные функции ----------
function shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function buildShuffledQuestion(question) {
    const originalOptions = question.options;
    const indices = originalOptions.map((_, i) => i);
    const shuffledIndices = shuffleArray(indices);
    question.shuffledOptions = shuffledIndices.map(i => originalOptions[i]);
    question.shuffledCorrectIndex = shuffledIndices.indexOf(question.correct_index);
    question.shuffledToOriginal = {};
    question.originalToShuffled = {};
    shuffledIndices.forEach((origIdx, shuffIdx) => {
        question.shuffledToOriginal[shuffIdx] = origIdx;
        question.originalToShuffled[origIdx] = shuffIdx;
    });
}

// ---------- localStorage для тренировки ----------
function saveTrainingProgress(ticketId, questionId, data) {
    const progress = JSON.parse(localStorage.getItem(TRAINING_STORAGE_KEY) || '{}');
    if (!progress[ticketId]) progress[ticketId] = {};
    progress[ticketId][questionId] = {
        selected: data.selected,          // original index
        is_correct: data.is_correct,
        correct_index: data.correct_index,
        explanation: data.explanation
    };
    localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify(progress));
}

function loadTrainingProgress(ticketId) {
    const progress = JSON.parse(localStorage.getItem(TRAINING_STORAGE_KEY) || '{}');
    return progress[ticketId] || {};
}

function clearTrainingProgress(ticketId = null) {
    if (ticketId) {
        const progress = JSON.parse(localStorage.getItem(TRAINING_STORAGE_KEY) || '{}');
        delete progress[ticketId];
        localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify(progress));
    } else {
        localStorage.removeItem(TRAINING_STORAGE_KEY);
    }
}

// ---------- Переключение режимов ----------
modeTrainingBtn.addEventListener('click', () => switchMode('training'));
modeExamBtn.addEventListener('click', () => switchMode('exam'));

function switchMode(mode) {
    currentMode = mode;
    if (mode === 'training') {
        trainingSection.style.display = 'block';
        examSection.style.display = 'none';
        modeTrainingBtn.classList.add('active');
        modeExamBtn.classList.remove('active');
        trainingQuestionsDiv.innerHTML = '';
        trainingQuestionsDiv.style.display = 'none';
        ticketListDiv.style.display = 'block';
    } else {
        trainingSection.style.display = 'none';
        examSection.style.display = 'block';
        modeTrainingBtn.classList.remove('active');
        modeExamBtn.classList.add('active');
        resetExamUI();
    }
}

// ---------- Загрузка списка билетов ----------
async function loadTickets() {
    const resp = await fetch('/api/tickets');
    allTickets = await resp.json();
    renderTicketList();
}
loadTickets();

function renderTicketList() {
    ticketListDiv.innerHTML = '';
    allTickets.forEach(ticket => {
        const btn = document.createElement('button');
        btn.className = 'ticket-btn';
        btn.textContent = ticket.title;
        btn.addEventListener('click', () => loadTrainingTicket(ticket.id));
        ticketListDiv.appendChild(btn);
    });
}

// ---------- Тренировка: загрузка билета и интерфейс с навигацией ----------
async function loadTrainingTicket(ticketId) {
    const resp = await fetch(`/api/tickets/${ticketId}`);
    currentTicket = await resp.json();
    // Перемешиваем варианты для каждого вопроса
    currentTicket.questions.forEach(buildShuffledQuestion);
    ticketListDiv.style.display = 'none';
    trainingQuestionsDiv.style.display = 'block';
    currentQuestionIndex = 0;
    renderTrainingInterface();
}

function renderTrainingInterface() {
    const questions = currentTicket.questions;
    const progress = loadTrainingProgress(currentTicket.id);

    let navHtml = '<div class="question-nav">';
    questions.forEach((q, index) => {
        const saved = progress[q.id];
        let statusClass = '';
        if (saved) {
            statusClass = saved.is_correct ? 'answered-correct' : 'answered-incorrect';
        }
        navHtml += `<button class="question-nav-btn ${statusClass}" data-index="${index}">${index + 1}</button>`;
    });
    navHtml += '</div>';

    trainingQuestionsDiv.innerHTML = `
        <h3>${currentTicket.title}</h3>
        ${navHtml}
        <div id="current-question-container"></div>
        <div id="training-result-card" style="display: none;"></div>
        <div class="training-controls">
            <button id="prev-question-btn" ${currentQuestionIndex === 0 ? 'disabled' : ''}>← Назад</button>
            <button id="next-question-btn" ${currentQuestionIndex === questions.length - 1 ? 'disabled' : ''}>Вперёд →</button>
            <button id="back-to-list-btn">← К списку билетов</button>
            <button id="reset-ticket-btn">Сбросить прогресс билета</button>
        </div>
    `;

    document.querySelectorAll('.question-nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            goToQuestion(index);
        });
    });

    document.getElementById('prev-question-btn').addEventListener('click', () => {
        if (currentQuestionIndex > 0) goToQuestion(currentQuestionIndex - 1);
    });
    document.getElementById('next-question-btn').addEventListener('click', () => {
        if (currentQuestionIndex < questions.length - 1) goToQuestion(currentQuestionIndex + 1);
    });
    document.getElementById('back-to-list-btn').addEventListener('click', () => {
        trainingQuestionsDiv.style.display = 'none';
        ticketListDiv.style.display = 'block';
    });
    document.getElementById('reset-ticket-btn').addEventListener('click', () => {
        clearTrainingProgress(currentTicket.id);
        currentQuestionIndex = 0;
        renderTrainingInterface();
        goToQuestion(0);
    });

    goToQuestion(currentQuestionIndex);
    checkTicketCompletion();
}

function goToQuestion(index) {
    const questions = currentTicket.questions;
    if (index < 0 || index >= questions.length) return;
    currentQuestionIndex = index;

    const resultCard = document.getElementById('training-result-card');
    const questionContainer = document.getElementById('current-question-container');
    const nav = document.querySelector('.question-nav');
    const controls = document.querySelector('.training-controls');

    if (resultCard) resultCard.style.display = 'none';
    if (questionContainer) questionContainer.style.display = 'block';
    if (nav) nav.style.display = '';
    if (controls) controls.style.display = '';

    renderCurrentQuestion();

    const prevBtn = document.getElementById('prev-question-btn');
    const nextBtn = document.getElementById('next-question-btn');
    if (prevBtn) prevBtn.disabled = (index === 0);
    if (nextBtn) nextBtn.disabled = (index === questions.length - 1);

    document.querySelectorAll('.question-nav-btn').forEach(btn => {
        const btnIndex = parseInt(btn.dataset.index);
        btn.classList.toggle('active', btnIndex === index);
    });
}

function renderCurrentQuestion() {
    const container = document.getElementById('current-question-container');
    if (!container) return;
    const question = currentTicket.questions[currentQuestionIndex];
    const progress = loadTrainingProgress(currentTicket.id);
    const saved = progress[question.id];

    let imageHtml = '';
    if (question.image_url) {
        imageHtml = `<img src="/static/${question.image_url}" alt="Иллюстрация" class="question-image">`;
    }

    container.innerHTML = `
        <div class="question-block">
            ${imageHtml}
            <p><strong>${question.question_text}</strong></p>
            <div class="options">
                ${question.shuffledOptions.map((opt, shuffIdx) => `
                    <label>
                        <input type="radio" name="training-question" value="${shuffIdx}" 
                            ${saved && question.originalToShuffled[saved.selected] === shuffIdx ? 'checked' : ''}>
                        ${opt}
                    </label>
                `).join('')}
            </div>
            <button class="check-btn" id="check-training-btn" ${saved ? 'disabled' : ''}>Проверить</button>
            <div class="result" id="training-result"></div>
        </div>
    `;

    if (saved) {
        displayTrainingResultInContainer(question, saved);
    }

    const checkBtn = document.getElementById('check-training-btn');
    if (checkBtn && !saved) {
        checkBtn.addEventListener('click', async () => {
            const selectedRadio = document.querySelector('input[name="training-question"]:checked');
            if (!selectedRadio) {
                alert('Выберите ответ');
                return;
            }
            const shuffIdx = parseInt(selectedRadio.value);
            const originalIdx = question.shuffledToOriginal[shuffIdx];
            const resp = await fetch('/api/check_answer', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ question_id: question.id, selected: originalIdx })
            });
            const data = await resp.json();
            saveTrainingProgress(currentTicket.id, question.id, {
                selected: originalIdx,
                is_correct: data.is_correct,
                correct_index: data.correct_index,
                explanation: data.explanation
            });
            displayTrainingResultInContainer(question, data);
            checkBtn.disabled = true;
            updateNavButton(currentQuestionIndex, data.is_correct);
            checkTicketCompletion();
        });
    }
}

function displayTrainingResultInContainer(question, data) {
    const resultDiv = document.getElementById('training-result');
    if (!resultDiv) return;
    if (data.is_correct) {
        resultDiv.innerHTML = '<span class="correct">Правильно!</span>';
    } else {
        const correctText = question.options[data.correct_index];
        resultDiv.innerHTML = `<span class="incorrect">Неправильно.</span> Правильный ответ: ${correctText}`;
    }
    if (data.explanation) {
        resultDiv.innerHTML += `<p class="explanation">${data.explanation}</p>`;
    }
}

function updateNavButton(index, isCorrect) {
    const btn = document.querySelector(`.question-nav-btn[data-index="${index}"]`);
    if (btn) {
        btn.classList.remove('answered-correct', 'answered-incorrect');
        btn.classList.add(isCorrect ? 'answered-correct' : 'answered-incorrect');
    }
}

function checkTicketCompletion() {
    const questions = currentTicket.questions;
    const progress = loadTrainingProgress(currentTicket.id);
    const answeredAll = questions.every(q => progress[q.id] !== undefined);

    if (answeredAll) {
        let correctCount = 0;
        questions.forEach(q => {
            if (progress[q.id].is_correct) correctCount++;
        });
        const total = questions.length;
        const errors = total - correctCount;
        const passed = errors < 4;

        const resultCard = document.getElementById('training-result-card');
        resultCard.style.display = 'block';
        resultCard.innerHTML = `
            <div class="result-card">
                <h3>Билет: ${currentTicket.title}</h3>
                <p>Правильных ответов: <strong>${correctCount}</strong> из ${total}</p>
                <p>Ошибок: <strong>${errors}</strong></p>
                <div class="result-msg ${passed ? 'correct' : 'incorrect'}">
                    ${passed ? '✅ Билет сдан!' : '❌ Билет не сдан.'}
                </div>
                <button id="retry-ticket-btn">Пройти заново</button>
                <button id="back-to-list-from-result-btn">← К списку билетов</button>
            </div>
        `;

        document.getElementById('current-question-container').style.display = 'none';
        document.querySelector('.question-nav').style.display = 'none';
        document.querySelector('.training-controls').style.display = 'none';

        document.getElementById('retry-ticket-btn').addEventListener('click', () => {
            clearTrainingProgress(currentTicket.id);
            currentQuestionIndex = 0;
            renderTrainingInterface();
            goToQuestion(0);
        });
        document.getElementById('back-to-list-from-result-btn').addEventListener('click', () => {
            trainingQuestionsDiv.style.display = 'none';
            ticketListDiv.style.display = 'block';
        });
    }
}

// ---------- Экзамен ----------
function resetExamUI() {
    startExamBtn.style.display = 'block';
    examInfoDiv.style.display = 'none';
    examQuestionsDiv.style.display = 'none';
    examResultDiv.style.display = 'none';
}

startExamBtn.addEventListener('click', startExam);

async function startExam() {
    const resp = await fetch('/api/exam/start');
    examData = await resp.json();
    // Перемешиваем варианты для каждого вопроса
    examData.questions.forEach(buildShuffledQuestion);
    examAnswered = {};
    examErrorCount = 0;
    currentQuestionIndex = 0;
    startExamBtn.style.display = 'none';
    examInfoDiv.style.display = 'block';
    examInfoDiv.innerHTML = `<h3>Экзаменационный билет: ${examData.title}</h3><p>Ответьте на все вопросы без ошибок.</p>`;
    examQuestionsDiv.style.display = 'block';
    renderExamInterface();
}

function renderExamInterface() {
    const questions = examData.questions;

    let navHtml = '<div class="question-nav">';
    questions.forEach((q, index) => {
        navHtml += `<button class="question-nav-btn" data-index="${index}">${index + 1}</button>`;
    });
    navHtml += '</div>';

    examQuestionsDiv.innerHTML = `
        ${navHtml}
        <div id="exam-current-question-container"></div>
        <div class="exam-controls">
            <button id="exam-prev-btn" ${currentQuestionIndex === 0 ? 'disabled' : ''}>← Назад</button>
            <button id="exam-next-btn" ${currentQuestionIndex === questions.length - 1 ? 'disabled' : ''}>Вперёд →</button>
            <button id="finish-exam-btn" style="display: none;">Завершить экзамен</button>
        </div>
    `;

    document.querySelectorAll('#exam-section .question-nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            goToExamQuestion(index);
        });
    });
    document.getElementById('exam-prev-btn').addEventListener('click', () => {
        if (currentQuestionIndex > 0) goToExamQuestion(currentQuestionIndex - 1);
    });
    document.getElementById('exam-next-btn').addEventListener('click', () => {
        if (currentQuestionIndex < questions.length - 1) goToExamQuestion(currentQuestionIndex + 1);
    });

    goToExamQuestion(currentQuestionIndex);
}

function goToExamQuestion(index) {
    const questions = examData.questions;
    if (index < 0 || index >= questions.length) return;
    currentQuestionIndex = index;
    renderExamCurrentQuestion();

    const prevBtn = document.getElementById('exam-prev-btn');
    const nextBtn = document.getElementById('exam-next-btn');
    if (prevBtn) prevBtn.disabled = (index === 0);
    if (nextBtn) nextBtn.disabled = (index === questions.length - 1);

    document.querySelectorAll('#exam-section .question-nav-btn').forEach(btn => {
        const btnIndex = parseInt(btn.dataset.index);
        btn.classList.toggle('active', btnIndex === index);
    });

    checkAllAnswered();
}

function renderExamCurrentQuestion() {
    const container = document.getElementById('exam-current-question-container');
    if (!container) return;
    const question = examData.questions[currentQuestionIndex];
    const answeredInfo = examAnswered[question.id];

    let imageHtml = '';
    if (question.image_url) {
        imageHtml = `<img src="/static/${question.image_url}" alt="Иллюстрация" class="question-image">`;
    }

    container.innerHTML = `
        <div class="question-block">
            ${imageHtml}
            <p><strong>${question.question_text}</strong></p>
            <div class="options">
                ${question.shuffledOptions.map((opt, shuffIdx) => `
                    <label>
                        <input type="radio" name="exam-question" value="${shuffIdx}" 
                            ${answeredInfo && question.originalToShuffled[answeredInfo.selected] === shuffIdx ? 'checked' : ''}
                            ${answeredInfo ? 'disabled' : ''}>
                        ${opt}
                    </label>
                `).join('')}
            </div>
            <button class="check-btn" id="exam-check-btn" ${answeredInfo ? 'disabled' : ''}>Ответить</button>
            <div class="result" id="exam-result"></div>
        </div>
    `;

    if (answeredInfo) {
        displayExamResultInContainer(question, answeredInfo);
    }

    const checkBtn = document.getElementById('exam-check-btn');
    if (checkBtn && !answeredInfo) {
        checkBtn.addEventListener('click', async () => {
            const selectedRadio = document.querySelector('input[name="exam-question"]:checked');
            if (!selectedRadio) {
                alert('Выберите ответ');
                return;
            }
            const shuffIdx = parseInt(selectedRadio.value);
            const originalIdx = question.shuffledToOriginal[shuffIdx];
            const resp = await fetch('/api/exam/answer', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ question_id: question.id, selected: originalIdx })
            });
            const data = await resp.json();
            examAnswered[question.id] = {
                selected: originalIdx,
                is_correct: data.is_correct,
                correct_index: data.correct_index,
                explanation: data.explanation
            };
            if (!data.is_correct) examErrorCount++;
            displayExamResultInContainer(question, examAnswered[question.id]);
            checkBtn.disabled = true;
            document.querySelectorAll('input[name="exam-question"]').forEach(r => r.disabled = true);
            updateExamNavButton(currentQuestionIndex, examAnswered[question.id].is_correct);
            checkAllAnswered();
        });
    }
}

function displayExamResultInContainer(question, data) {
    const resultDiv = document.getElementById('exam-result');
    if (!resultDiv) return;
    if (data.is_correct) {
        resultDiv.innerHTML = '<span class="correct">Правильно!</span>';
    } else {
        const correctText = question.options[data.correct_index];
        resultDiv.innerHTML = `<span class="incorrect">Ошибка.</span> Правильный ответ: ${correctText}`;
    }
    if (data.explanation) {
        resultDiv.innerHTML += `<p class="explanation">${data.explanation}</p>`;
    }
}

function updateExamNavButton(index, isCorrect) {
    const btn = document.querySelector(`#exam-section .question-nav-btn[data-index="${index}"]`);
    if (btn) {
        btn.classList.add(isCorrect ? 'answered-correct' : 'answered-incorrect');
    }
}

function checkAllAnswered() {
    const total = examData.questions.length;
    const answeredCount = Object.keys(examAnswered).length;
    const finishBtn = document.getElementById('finish-exam-btn');

    if (answeredCount === total) {
        if (finishBtn) finishBtn.style.display = 'inline-block';
        if (!finishBtn) {
            const controls = document.querySelector('.exam-controls');
            const btn = document.createElement('button');
            btn.id = 'finish-exam-btn';
            btn.textContent = 'Завершить экзамен';
            btn.addEventListener('click', finishExam);
            controls.appendChild(btn);
        } else {
            finishBtn.onclick = finishExam;
        }
    } else {
        if (finishBtn) finishBtn.style.display = 'none';
    }
}

async function finishExam() {
    const resp = await fetch('/api/exam/result');
    const result = await resp.json();
    examResultDiv.style.display = 'block';
    examResultDiv.innerHTML = `<div class="result-msg ${result.passed ? 'correct' : 'incorrect'}">${result.message}</div>`;
    const retryBtn = document.createElement('button');
    retryBtn.textContent = 'Пересдать экзамен';
    retryBtn.addEventListener('click', () => {
        resetExamUI();
        startExam();
    });
    examResultDiv.appendChild(retryBtn);
    examQuestionsDiv.style.display = 'none';
}