window.CertificateGenerator = {
    /**
     * Генерирует именной сертификат в виде data URL (PNG).
     * @param {string} studentName - имя студента
     * @param {string} ticketTitle - название билета
     * @param {number} errors - количество ошибок
     * @param {number} total - общее число вопросов
     * @returns {string} data URL изображения
     */
    generate: function(studentName, ticketTitle, errors, total) {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');

        // Фон
        ctx.fillStyle = '#dce7f5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Внешняя рамка
        ctx.strokeStyle = '#13478b';
        ctx.lineWidth = 10;
        ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

        // Внутренняя рамка
        ctx.strokeStyle = '#216cde';
        ctx.lineWidth = 2;
        ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

        // Заголовок
        ctx.fillStyle = '#2f4f4f';
        ctx.font = 'bold 36px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('СЕРТИФИКАТ', canvas.width / 2, 100);

        ctx.font = 'italic 20px Arial, sans-serif';
        ctx.fillText('о прохождении экзамена', canvas.width / 2, 140);

        // Декоративная линия
        ctx.beginPath();
        ctx.moveTo(150, 170);
        ctx.lineTo(canvas.width - 150, 170);
        ctx.strokeStyle = '#1a51be';
        ctx.stroke();

        // Имя студента
        ctx.font = '28px Arial, sans-serif';
        ctx.fillStyle = '#000';
        ctx.fillText('Настоящим подтверждается, что', canvas.width / 2, 220);
        ctx.font = 'bold 34px Arial, sans-serif';
        ctx.fillText(studentName || 'Студент', canvas.width / 2, 280);

        // Описание билета
        ctx.font = '24px Arial, sans-serif';
        ctx.fillStyle = '#333';
        const text = `успешно сдал(а) экзамен по билету «${ticketTitle}».`;
        ctx.fillText(text, canvas.width / 2, 340);

        ctx.font = '24px Arial, sans-serif';
        ctx.fillText(`Допущено ошибок: ${errors} из ${total}`, canvas.width / 2, 390);

        // Подпись
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2 - 100, 480);
        ctx.lineTo(canvas.width / 2 + 100, 480);
        ctx.strokeStyle = '#555';
        ctx.stroke();
        ctx.font = '18px Arial, sans-serif';
        ctx.fillText('Подпись преподавателя', canvas.width / 2, 510);

        // Дата
        const today = new Date().toLocaleDateString('ru-RU');
        ctx.font = '16px Arial, sans-serif';
        ctx.fillText(today, canvas.width / 2, 550);

        return canvas.toDataURL('image/png');
    },

    /**
     * Формирует безопасное имя файла для сертификата.
     * @param {string} studentName - полное имя
     * @param {string} ticketTitle - название билета
     * @returns {string} имя файла без расширения
     */
    getFileName: function(studentName, ticketTitle) {
        const lastName = studentName.trim().split(/\s+/)[0] || 'student';

        const sanitize = (str) => {
            return str
                .trim()
                .replace(/\s+/g, '_')                    
                .replace(/[^a-zA-Zа-яёА-ЯЁ0-9\-_]/g, '') 
                .replace(/_+/g, '_')
                .replace(/^_+|_+$/g, '')
                || 'name';
        };

        const safeLastName = sanitize(lastName);
        const safeTicket = sanitize(ticketTitle) || 'ticket';

        return `CN-Certificate-${safeLastName}-${safeTicket}`;
    }
};