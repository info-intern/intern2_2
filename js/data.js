// 蔵書・予約・貸出履歴データの取得と加工を担当するモジュール

const BOOKS_URL = 'data/books.json';
const RESERVATIONS_URL = 'data/reservations.json';
const LOAN_HISTORY_KEY = 'loanHistory';
const LOAN_PERIOD_DAYS = 14;
const LOAN_STATUS_ACTIVE = '貸出中';
const LOAN_STATUS_RETURNED = '返却済み';
const RESERVATION_HISTORY_KEY = 'reservationHistory';
const RESERVATION_STATUS_ACTIVE = '予約中';
const RESERVATION_STATUS_CANCELLED = '取消済み';
const CANCELLED_RESERVATION_CODES_KEY = 'cancelledReservationCodes';

/**
 * 蔵書データ(books.json)を取得する
 */
async function loadBooks() {
    const res = await fetch(BOOKS_URL);
    if (!res.ok) {
        throw new Error('蔵書データの読み込みに失敗しました');
    }
    return res.json();
}

/**
 * 予約中の本のコード一覧(reservations.json)を取得する
 */
async function loadReservations() {
    const res = await fetch(RESERVATIONS_URL);
    if (!res.ok) {
        throw new Error('予約データの読み込みに失敗しました');
    }
    return res.json();
}

/**
 * LocalStorageから貸出履歴を取得する
 */
function getLoanHistory() {
    const raw = localStorage.getItem(LOAN_HISTORY_KEY);
    if (!raw) {
        return [];
    }
    try {
        return JSON.parse(raw);
    } catch (e) {
        return [];
    }
}

/**
 * 貸出履歴をLocalStorageへ保存する
 */
function saveLoanHistory(history) {
    localStorage.setItem(LOAN_HISTORY_KEY, JSON.stringify(history));
}

/**
 * LocalStorageから予約履歴を取得する
 */
function getReservationHistory() {
    const raw = localStorage.getItem(RESERVATION_HISTORY_KEY);
    if (!raw) {
        return [];
    }
    try {
        return JSON.parse(raw);
    } catch (e) {
        return [];
    }
}

/**
 * 予約履歴をLocalStorageへ保存する
 */
function saveReservationHistory(history) {
    localStorage.setItem(RESERVATION_HISTORY_KEY, JSON.stringify(history));
}

/**
 * LocalStorageから、取り消し済みの初期データ予約のコード一覧を取得する
 */
function getCancelledReservationCodes() {
    const raw = localStorage.getItem(CANCELLED_RESERVATION_CODES_KEY);
    if (!raw) {
        return [];
    }
    try {
        return JSON.parse(raw);
    } catch (e) {
        return [];
    }
}

/**
 * 取り消し済みの初期データ予約のコード一覧をLocalStorageへ保存する
 */
function saveCancelledReservationCodes(codes) {
    localStorage.setItem(CANCELLED_RESERVATION_CODES_KEY, JSON.stringify(codes));
}

/**
 * コードに対応する「予約中」の履歴レコードを検索する
 */
function findActiveReservation(code, history) {
    for (let i = 0; i < history.length; i++) {
        if (history[i].code === code && history[i].status === RESERVATION_STATUS_ACTIVE) {
            return history[i];
        }
    }
    return null;
}

/**
 * コードから蔵書データを検索する
 */
function findBookByCode(code, books) {
    for (let i = 0; i < books.length; i++) {
        if (books[i].code === code) {
            return books[i];
        }
    }
    return null;
}

/**
 * コードに対応する「貸出中」の履歴レコードを検索する
 */
function findActiveLoan(code, history) {
    for (let i = 0; i < history.length; i++) {
        if (history[i].code === code && history[i].status === LOAN_STATUS_ACTIVE) {
            return history[i];
        }
    }
    return null;
}

/**
 * コードに対応する初期データの予約情報（{code, dueDate}）を検索する
 */
function findReservationEntry(code, reservations) {
    for (let i = 0; i < reservations.length; i++) {
        if (reservations[i].code === code) {
            return reservations[i];
        }
    }
    return null;
}

/**
 * 指定コードが予約中かどうかを判定する（初期データの予約一覧を対象）
 */
function isReserved(code, reservations) {
    return findReservationEntry(code, reservations) !== null;
}

/**
 * 指定コードが予約中かどうかを判定する（初期データ＋アプリ内で作成した予約の両方を対象）
 */
function isReservedNow(code, reservations, reservationHistory) {
    return isReserved(code, reservations) || findActiveReservation(code, reservationHistory) !== null;
}

/**
 * 指定コードの予約返却期限日を取得する（初期データ＋アプリ内で作成した予約の両方を対象）。
 * 予約が無い場合はnullを返す。
 */
function getReservationDueDate(code, reservations, reservationHistory) {
    const entry = findReservationEntry(code, reservations);
    if (entry) {
        return entry.dueDate;
    }
    const activeReservation = findActiveReservation(code, reservationHistory);
    if (activeReservation) {
        return activeReservation.reserveDate;
    }
    return null;
}

/**
 * Dateオブジェクトを yyyy/MM/dd 形式の文字列に変換する
 */
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '/' + m + '/' + d;
}

/**
 * 今日から指定日数後の日付文字列を返す
 */
function addDaysToToday(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return formatDate(date);
}

/**
 * 今日の日付文字列を返す
 */
function getTodayString() {
    return formatDate(new Date());
}

/**
 * 今日の日付を yyyy-MM-dd 形式（input[type=date]用）で返す
 */
function getTodayIsoString() {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}

/**
 * yyyy-MM-dd 形式の日付文字列を yyyy/MM/dd 形式に変換する
 */
function formatIsoDate(isoDate) {
    return isoDate.split('-').join('/');
}
