import os
import random
import json
import pymysql
from flask import Flask, jsonify, request, session, render_template
from abc import ABC, abstractmethod

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'super-secret-key')

# Конфигурация MySQL
db_config = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', 'password'),
    'database': os.environ.get('DB_NAME', 'network_exam'),
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor
}

# ---------- Абстрактный провайдер данных ----------
class DataProvider(ABC):
    @abstractmethod
    def get_all_tickets(self):
        """Возвращает список словарей {id, title}."""
        pass

    @abstractmethod
    def get_ticket(self, ticket_id):
        """Возвращает билет со словарём вопросов [{id, question_text, options}] и title."""
        pass

    @abstractmethod
    def get_question(self, question_id):
        """Возвращает {correct_index, explanation} или None."""
        pass

# ---------- MySQL-провайдер ----------
class MySQLDataProvider(DataProvider):
    def __init__(self, config):
        self.config = config

    def _connect(self):
        return pymysql.connect(**self.config)

    def get_all_tickets(self):
        conn = self._connect()
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT id, title FROM tickets ORDER BY id")
                return cursor.fetchall()
        finally:
            conn.close()

    def get_ticket(self, ticket_id):
        conn = self._connect()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT id, question_text, options, image_url FROM questions WHERE ticket_id = %s",
                    (ticket_id,)
                )
                questions = cursor.fetchall()
                if not questions:
                    return None
                for q in questions:
                    if isinstance(q['options'], str):
                        q['options'] = json.loads(q['options'])
                cursor.execute("SELECT title FROM tickets WHERE id = %s", (ticket_id,))
                ticket = cursor.fetchone()
                return {
                    "id": ticket_id,
                    "title": ticket['title'],
                    "questions": questions   # каждый вопрос уже содержит image_url
                }
        finally:
            conn.close()

    def get_question(self, question_id):
        conn = self._connect()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT correct_index, explanation FROM questions WHERE id = %s",
                    (question_id,)
                )
                return cursor.fetchone()
        finally:
            conn.close()

# ---------- JSON-провайдер ----------
class JSONDataProvider(DataProvider):
    def __init__(self, filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            self.tickets = json.load(f)
        # Строим индекс вопросов для быстрого поиска
        self.question_index = {}
        for ticket in self.tickets:
            for q in ticket['questions']:
                q['question_text'] = q.pop('text')  # переименовываем для единообразия
                self.question_index[q['id']] = q

    def get_all_tickets(self):
        return [{"id": t["id"], "title": t["title"]} for t in self.tickets]

    def get_ticket(self, ticket_id):
        for t in self.tickets:
            if t['id'] == ticket_id:
                # Возвращаем копию, чтобы не модифицировать оригинал
                questions = []
                for q in t['questions']:
                    questions.append({
                        "id": q["id"],
                        "question_text": q["question_text"],
                        "options": q["options"]
                    })
                return {"id": ticket_id, "title": t["title"], "questions": questions}
        return None

    def get_question(self, question_id):
        q = self.question_index.get(question_id)
        if q:
            return {"correct_index": q["correct"], "explanation": q.get("explanation", "")}
        return None

# ---------- Выбор провайдера при старте ----------
def create_data_provider():
    try:
        # Проверяем доступность MySQL
        conn = pymysql.connect(**db_config)
        conn.close()
        print("Используется MySQL")
        return MySQLDataProvider(db_config)
    except Exception as e:
        print(f"MySQL недоступна ({e}). Использую JSON-файл.")
        json_path = os.environ.get('JSON_PATH', 'tickets.json')
        return JSONDataProvider(json_path)

dp = create_data_provider()

# ---------- Маршруты ----------
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/tickets', methods=['GET'])
def get_tickets():
    return jsonify(dp.get_all_tickets())

@app.route('/api/tickets/<int:ticket_id>', methods=['GET'])
def get_ticket(ticket_id):
    ticket = dp.get_ticket(ticket_id)
    if not ticket:
        return jsonify({"error": "Билет не найден"}), 404
    return jsonify(ticket)

@app.route('/api/check_answer', methods=['POST'])
def check_answer():
    data = request.json
    question_id = data.get('question_id')
    selected = data.get('selected')
    row = dp.get_question(question_id)
    if not row:
        return jsonify({"error": "Вопрос не найден"}), 404
    is_correct = (selected == row['correct_index'])
    return jsonify({
        "correct_index": row['correct_index'],
        "is_correct": is_correct,
        "explanation": row.get('explanation', '')
    })

# ---------- Экзамен (без изменений в логике) ----------
@app.route('/api/exam/start', methods=['GET'])
def start_exam():
    all_tickets = dp.get_all_tickets()
    used_tickets = session.get('used_exam_tickets', [])
    available = [t for t in all_tickets if t['id'] not in used_tickets]
    if not available:
        session['used_exam_tickets'] = []
        available = all_tickets
    if not available:
        return jsonify({"error": "Нет билетов"}), 500
    ticket_info = random.choice(available)
    ticket = dp.get_ticket(ticket_info['id'])
    session['exam_ticket_id'] = ticket['id']
    session['exam_errors'] = 0
    used_tickets.append(ticket['id'])
    session['used_exam_tickets'] = used_tickets
    return jsonify({
        "ticket_id": ticket['id'],
        "title": ticket['title'],
        "questions": ticket['questions']
    })

@app.route('/api/exam/answer', methods=['POST'])
def exam_answer():
    data = request.json
    question_id = data.get('question_id')
    selected = data.get('selected')
    row = dp.get_question(question_id)
    if not row:
        return jsonify({"error": "Вопрос не найден"}), 404
    is_correct = (selected == row['correct_index'])
    if not is_correct:
        session['exam_errors'] = session.get('exam_errors', 0) + 1
    return jsonify({
        "is_correct": is_correct,
        "correct_index": row['correct_index'],
        "explanation": row.get('explanation', ''),
        "errors": session.get('exam_errors', 0)
    })

@app.route('/api/exam/result', methods=['GET'])
def exam_result():
    errors = session.get('exam_errors', 0)
    passed = (errors == 0)
    return jsonify({
        "passed": passed,
        "errors": errors,
        "message": "Экзамен сдан!" if passed else "Допущены ошибки. Экзамен не сдан."
    })

if __name__ == '__main__':
    app.run(debug=True)