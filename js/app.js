// 画面遷移とスキャン・確認・確定処理を制御するメインスクリプト

let allBooks = [];
let reservedCodes = [];
let loanHistory = [];
let reservationHistory = [];
let cancelledReservationCodes = [];
let currentMode = null; // '貸出' または '返却'
let confirmItems = [];  // 確認画面に表示する本のリスト
let reserveSelectedCodes = []; // 予約フローで選択中の本のコード一覧
let reserveItems = [];         // 予約を確定する本のリスト（タイトル込み）

/**
 * 画面ID(screen-xxx)を1つだけ表示し、他は隠す
 */
function showScreen(screenId) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(function (screen) {
        screen.hidden = screen.id !== screenId;
    });
}

/**
 * アプリの状態を初期状態に戻し、ホーム画面へ遷移する
 */
function goHome() {
    currentMode = null;
    confirmItems = [];
    reserveSelectedCodes = [];
    reserveItems = [];
    showScreen('screen-home');
}

/**
 * 「貸出」または「返却」ボタン押下時、モードを設定してスキャン画面へ遷移する
 */
function startMode(mode) {
    currentMode = mode;
    const label = document.getElementById('scan-label');
    label.textContent = mode + 'する本の背表紙をスキャンしてください';
    showScreen('screen-scan');
}

/**
 * スキャンを開始し、IroatoReaderの読み取り結果を受け取る
 */
function beginScan() {
    const readerOptions = {
        analyzeLevel: 5,
        resolution: (typeof IroatoReader !== 'undefined') ? IroatoReader.r1920x1080 : undefined,
        searchCodes: allBooks.map(function (book) { return book.code; }),
        labelText: currentMode + 'する本の背表紙を1冊ずつ読み取ってください',
        buttonText: '読み取り完了'
    };
    const reader = createReader('cc', readerOptions);
    reader.read(readerOptions, handleScanResult);
}

/**
 * スキャン結果を受け取り、成否を確認したうえで確認画面用データを作成する
 */
function handleScanResult(res) {
    if (!res.status) {
        window.alert('コードの読み取りに失敗しました。もう一度お試しください。');
        return;
    }

    const rawCodes = res.data.codes.map(function (item) { return item.code; });
    const uniqueCodes = rawCodes.filter(function (code, index) {
        return rawCodes.indexOf(code) === index;
    });

    const result = buildConfirmItems(uniqueCodes);
    confirmItems = result.items;

    if (result.skippedMessages.length > 0) {
        window.alert(result.skippedMessages.join('\n'));
    }

    if (confirmItems.length === 0) {
        window.alert('確認できる本がありませんでした。ホーム画面に戻ります。');
        goHome();
        return;
    }

    renderConfirmScreen();
    showScreen('screen-confirm');
}

/**
 * 読み取ったコードから確認画面用の本情報リストを作成する。
 * 貸出モードでは既に貸出中の本、返却モードでは貸出中でない本を除外する。
 */
function buildConfirmItems(codes) {
    const items = [];
    const skippedMessages = [];

    codes.forEach(function (code) {
        const book = findBookByCode(code, allBooks);
        if (!book) {
            skippedMessages.push('未登録のコードのため除外しました: ' + code);
            return;
        }

        const activeLoan = findActiveLoan(code, loanHistory);

        if (currentMode === '貸出') {
            if (activeLoan) {
                skippedMessages.push('「' + book.title + '」は既に貸出中のため除外しました');
                return;
            }
            const loanDueDate = addDaysToToday(LOAN_PERIOD_DAYS);
            const reservationDueDate = getReservationDueDate(book.code, reservedCodes, reservationHistory);
            // 予約期限日が今回の貸出期間（貸出日〜返却期限日）と重複する場合のみ警告対象とする
            const hasReservationConflict = reservationDueDate !== null && reservationDueDate <= loanDueDate;
            items.push({
                code: book.code,
                title: book.title,
                author: book.author,
                genre: book.genre,
                loanDate: getTodayString(),
                dueDate: loanDueDate,
                hasReservation: hasReservationConflict,
                reservationDueDate: reservationDueDate
            });
        } else {
            if (!activeLoan) {
                skippedMessages.push('「' + book.title + '」は貸出中ではないため除外しました');
                return;
            }
            items.push({
                code: book.code,
                title: book.title,
                author: book.author,
                genre: book.genre,
                loanDate: activeLoan.loanDate,
                dueDate: activeLoan.dueDate,
                hasReservation: isReservedNow(book.code, reservedCodes, reservationHistory),
                reservationDueDate: getReservationDueDate(book.code, reservedCodes, reservationHistory)
            });
        }
    });

    return { items: items, skippedMessages: skippedMessages };
}

/**
 * 確認画面のタイトル・一覧・フッターを描画する
 */
function renderConfirmScreen() {
    const title = document.getElementById('confirm-title');
    title.textContent = currentMode + '確認 (' + confirmItems.length + '冊)';

    const list = document.getElementById('confirm-list');
    list.textContent = '';
    confirmItems.forEach(function (item) {
        list.appendChild(createConfirmRow(item));
    });

    const total = document.getElementById('confirm-total');
    total.textContent = '合計 ' + confirmItems.length + ' 冊';

    const submitBtn = document.getElementById('confirm-submit-btn');
    submitBtn.textContent = currentMode + 'を確定する';
}

/**
 * 確認画面の1行分(アコーディオン)のDOM要素を作成する
 */
function createConfirmRow(item) {
    const details = document.createElement('details');
    details.className = 'book-item';

    const summary = document.createElement('summary');

    const titleSpan = document.createElement('span');
    titleSpan.className = 'book-title';
    titleSpan.textContent = item.title;
    summary.appendChild(titleSpan);

    if (item.hasReservation) {
        const badge = document.createElement('span');
        badge.className = 'reserved-badge';
        badge.textContent = '⚠ 予約あり';
        summary.appendChild(badge);
    }

    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.textContent = '﹀';
    summary.appendChild(chevron);

    details.appendChild(summary);

    const detail = document.createElement('div');
    detail.className = 'book-detail';
    detail.appendChild(createDetailRow('著者', item.author, false));
    detail.appendChild(createDetailRow('ジャンル', item.genre, false));
    detail.appendChild(createDetailRow('貸出日', item.loanDate, false));
    detail.appendChild(createDetailRow('返却期限', item.dueDate, false));
    detail.appendChild(createDetailRow(
        '予約',
        item.hasReservation ? 'あり（他利用者）' : 'なし',
        item.hasReservation
    ));
    details.appendChild(detail);

    return details;
}

/**
 * 確認画面の詳細欄1行分(ラベルと値)のDOM要素を作成する
 */
function createDetailRow(label, value, isReservedRow) {
    const row = document.createElement('div');
    row.className = 'book-detail-row' + (isReservedRow ? ' is-reserved' : '');

    const labelSpan = document.createElement('span');
    labelSpan.className = 'book-detail-label';
    labelSpan.textContent = label;
    row.appendChild(labelSpan);

    const valueSpan = document.createElement('span');
    valueSpan.className = 'book-detail-value';
    valueSpan.textContent = value;
    row.appendChild(valueSpan);

    return row;
}

/**
 * 確認画面の確定ボタン押下時、貸出/返却を確定し履歴を更新する
 */
function handleConfirmSubmit() {
    if (currentMode === '貸出') {
        const hasReservedItem = confirmItems.some(function (item) { return item.hasReservation; });
        if (hasReservedItem) {
            const confirmed = window.confirm('予約ありの本が含まれています。貸出を続けますか？');
            if (!confirmed) {
                return;
            }
        }
    }

    const today = getTodayString();

    confirmItems.forEach(function (item) {
        if (currentMode === '貸出') {
            loanHistory.push({
                code: item.code,
                loanDate: today,
                dueDate: item.dueDate,
                hasReservation: item.hasReservation,
                status: LOAN_STATUS_ACTIVE
            });
        } else {
            const activeLoan = findActiveLoan(item.code, loanHistory);
            if (activeLoan) {
                activeLoan.dueDate = today;
                activeLoan.hasReservation = item.hasReservation;
                activeLoan.status = LOAN_STATUS_RETURNED;
            }
        }
    });

    saveLoanHistory(loanHistory);
    renderCompleteScreen();
    showScreen('screen-complete');
}

/**
 * 完了画面のメッセージ・処理済み一覧・予約に関する注意書きを描画する
 */
function renderCompleteScreen() {
    const message = document.getElementById('complete-message');
    message.textContent = currentMode + '処理が完了しました（' + confirmItems.length + '冊 / ' + getTodayString() + '）';

    const list = document.getElementById('complete-list');
    list.textContent = '';
    confirmItems.forEach(function (item) {
        const li = document.createElement('li');
        li.className = 'simple-item';
        li.textContent = item.title;
        list.appendChild(li);
    });

    const notice = document.getElementById('complete-notice');
    const reservedItems = confirmItems.filter(function (item) { return item.hasReservation; });
    notice.textContent = '';
    if (reservedItems.length > 0) {
        const p = document.createElement('p');
        p.textContent = currentMode === '貸出'
            ? '予約が入っている本があります。期限までに返却してください。'
            : '予約が入っている本があります。予約者への連絡をお願いします。';
        notice.appendChild(p);

        const ul = document.createElement('ul');
        reservedItems.forEach(function (item) {
            const li = document.createElement('li');
            li.textContent = (currentMode === '貸出' && item.reservationDueDate)
                ? item.title + '（' + item.reservationDueDate + 'までに返却）'
                : item.title;
            ul.appendChild(li);
        });
        notice.appendChild(ul);
        notice.hidden = false;
    } else {
        notice.hidden = true;
    }
}

/**
 * 蔵書一覧画面のタイトルと一覧を描画する
 */
function renderBooksScreen() {
    const title = document.getElementById('books-title');
    title.textContent = '蔵書一覧 (' + allBooks.length + '冊)';

    const list = document.getElementById('books-list');
    list.textContent = '';
    allBooks.forEach(function (book) {
        list.appendChild(createBookInfoRow(book));
    });
}

/**
 * 蔵書一覧画面の1行分(アコーディオン)のDOM要素を作成する
 */
function createBookInfoRow(book) {
    const activeLoan = findActiveLoan(book.code, loanHistory);

    const details = document.createElement('details');
    details.className = 'book-item';

    const summary = document.createElement('summary');

    const titleSpan = document.createElement('span');
    titleSpan.className = 'book-title';
    titleSpan.textContent = book.title;
    summary.appendChild(titleSpan);

    if (activeLoan) {
        const badge = document.createElement('span');
        badge.className = 'status-badge';
        badge.textContent = '貸出中';
        summary.appendChild(badge);
    }

    if (isReservedNow(book.code, reservedCodes, reservationHistory)) {
        const badge = document.createElement('span');
        badge.className = 'reserved-badge';
        badge.textContent = '⚠ 予約あり';
        summary.appendChild(badge);
    }

    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.textContent = '﹀';
    summary.appendChild(chevron);

    details.appendChild(summary);

    const detail = document.createElement('div');
    detail.className = 'book-detail';
    detail.appendChild(createDetailRow('著者', book.author, false));
    detail.appendChild(createDetailRow('ジャンル', book.genre, false));
    detail.appendChild(createDetailRow('所蔵冊数', book.count + '冊', false));
    detail.appendChild(createDetailRow('貸出状況', activeLoan ? '貸出中' : '貸出可能', false));
    details.appendChild(detail);

    return details;
}

/**
 * 貸出中一覧画面のタイトルと一覧を描画する
 */
function renderLoansScreen() {
    const activeLoans = loanHistory.filter(function (record) {
        return record.status === LOAN_STATUS_ACTIVE;
    });

    const title = document.getElementById('loans-title');
    title.textContent = '貸出中一覧 (' + activeLoans.length + '冊)';

    const list = document.getElementById('loans-list');
    const emptyMessage = document.getElementById('loans-empty');
    list.textContent = '';

    if (activeLoans.length === 0) {
        list.hidden = true;
        emptyMessage.hidden = false;
        return;
    }

    list.hidden = false;
    emptyMessage.hidden = true;
    activeLoans.forEach(function (loan) {
        const book = findBookByCode(loan.code, allBooks);
        list.appendChild(createLoanInfoRow(loan, book));
    });
}

/**
 * 貸出中一覧画面の1行分(アコーディオン)のDOM要素を作成する
 */
function createLoanInfoRow(loan, book) {
    const title = book ? book.title : '未登録の本 (コード: ' + loan.code + ')';

    const details = document.createElement('details');
    details.className = 'book-item';

    const summary = document.createElement('summary');

    const titleSpan = document.createElement('span');
    titleSpan.className = 'book-title';
    titleSpan.textContent = title;
    summary.appendChild(titleSpan);

    if (loan.hasReservation) {
        const badge = document.createElement('span');
        badge.className = 'reserved-badge';
        badge.textContent = '⚠ 予約あり';
        summary.appendChild(badge);
    }

    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.textContent = '﹀';
    summary.appendChild(chevron);

    details.appendChild(summary);

    const detail = document.createElement('div');
    detail.className = 'book-detail';
    if (book) {
        detail.appendChild(createDetailRow('著者', book.author, false));
        detail.appendChild(createDetailRow('ジャンル', book.genre, false));
    }
    detail.appendChild(createDetailRow('貸出日', loan.loanDate, false));
    detail.appendChild(createDetailRow('返却期限', loan.dueDate, false));
    detail.appendChild(createDetailRow(
        '予約',
        loan.hasReservation ? 'あり（他利用者）' : 'なし',
        loan.hasReservation
    ));
    details.appendChild(detail);

    return details;
}

/**
 * 「予約」ボタン押下時、予約フローの状態を初期化して本の選択画面へ遷移する
 */
function startReserve() {
    reserveSelectedCodes = [];
    reserveItems = [];
    renderReserveSelectScreen();
    showScreen('screen-reserve-select');
}

/**
 * 予約する本の選択画面の一覧を描画する
 */
function renderReserveSelectScreen() {
    const title = document.getElementById('reserve-select-title');
    title.textContent = '予約する本を選択 (' + allBooks.length + '冊)';

    const list = document.getElementById('reserve-select-list');
    list.textContent = '';
    allBooks.forEach(function (book) {
        list.appendChild(createReserveSelectRow(book));
    });

    updateReserveSelectFooter();
}

/**
 * 本の選択画面の1行分（チェックボックス付き）のDOM要素を作成する
 */
function createReserveSelectRow(book) {
    const activeLoan = findActiveLoan(book.code, loanHistory);
    const alreadyReserved = isReservedNow(book.code, reservedCodes, reservationHistory);

    const row = document.createElement('label');
    row.className = 'book-item reserve-select-row' + (alreadyReserved ? ' is-disabled' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'reserve-checkbox';
    checkbox.disabled = alreadyReserved;
    checkbox.checked = reserveSelectedCodes.indexOf(book.code) !== -1;
    checkbox.addEventListener('change', function () {
        toggleReserveSelection(book.code, checkbox.checked);
    });
    row.appendChild(checkbox);

    const titleSpan = document.createElement('span');
    titleSpan.className = 'book-title';
    titleSpan.textContent = book.title;
    row.appendChild(titleSpan);

    if (activeLoan) {
        const badge = document.createElement('span');
        badge.className = 'status-badge';
        badge.textContent = '貸出中';
        row.appendChild(badge);
    }

    if (alreadyReserved) {
        const badge = document.createElement('span');
        badge.className = 'reserved-badge';
        badge.textContent = '⚠ 予約済み';
        row.appendChild(badge);
    }

    return row;
}

/**
 * 本の選択画面でのチェック状態変更を選択リストへ反映する
 */
function toggleReserveSelection(code, checked) {
    const index = reserveSelectedCodes.indexOf(code);
    if (checked && index === -1) {
        reserveSelectedCodes.push(code);
    } else if (!checked && index !== -1) {
        reserveSelectedCodes.splice(index, 1);
    }
    updateReserveSelectFooter();
}

/**
 * 本の選択画面フッターの選択数表示と「次へ」ボタンの活性状態を更新する
 */
function updateReserveSelectFooter() {
    const total = document.getElementById('reserve-select-total');
    total.textContent = '選択中 ' + reserveSelectedCodes.length + ' 冊';

    const nextBtn = document.getElementById('reserve-select-next-btn');
    nextBtn.disabled = reserveSelectedCodes.length === 0;
}

/**
 * 本の選択画面の「次へ」ボタン押下時、選択内容を確定して予約日指定画面へ遷移する
 */
function handleReserveSelectNext() {
    if (reserveSelectedCodes.length === 0) {
        return;
    }

    reserveItems = reserveSelectedCodes.map(function (code) {
        const book = findBookByCode(code, allBooks);
        return { code: code, title: book ? book.title : '未登録の本 (コード: ' + code + ')' };
    });

    renderReserveDateScreen();
    showScreen('screen-reserve-date');
}

/**
 * 予約日指定画面の選択本一覧を描画し、日付欄を初期化する
 */
function renderReserveDateScreen() {
    const title = document.getElementById('reserve-date-title');
    title.textContent = '予約日を指定 (' + reserveItems.length + '冊)';

    const list = document.getElementById('reserve-date-list');
    list.textContent = '';
    reserveItems.forEach(function (item) {
        const li = document.createElement('li');
        li.className = 'simple-item';
        li.textContent = item.title;
        list.appendChild(li);
    });

    const dateInput = document.getElementById('reserve-date-input');
    dateInput.min = getTodayIsoString();
    dateInput.value = '';
}

/**
 * 予約日指定画面の確定ボタン押下時、入力値を確認して予約を登録する
 */
function handleReserveDateSubmit() {
    const dateInput = document.getElementById('reserve-date-input');
    const isoDate = dateInput.value;

    if (!isoDate) {
        window.alert('予約期限日を選択してください。');
        return;
    }
    if (isoDate < getTodayIsoString()) {
        window.alert('予約期限日は本日以降の日付を選択してください。');
        return;
    }

    const reserveDate = formatIsoDate(isoDate);
    const createdDate = getTodayString();

    reserveItems.forEach(function (item) {
        reservationHistory.push({
            code: item.code,
            reserveDate: reserveDate,
            createdDate: createdDate,
            status: RESERVATION_STATUS_ACTIVE
        });
    });

    saveReservationHistory(reservationHistory);
    renderReserveCompleteScreen(reserveDate);
    showScreen('screen-reserve-complete');
}

/**
 * 予約完了画面のメッセージと予約した本の一覧を描画する
 */
function renderReserveCompleteScreen(reserveDate) {
    const message = document.getElementById('reserve-complete-message');
    message.textContent = '予約が完了しました（' + reserveItems.length + '冊 / 期限: ' + reserveDate + '）';

    const list = document.getElementById('reserve-complete-list');
    list.textContent = '';
    reserveItems.forEach(function (item) {
        const li = document.createElement('li');
        li.className = 'simple-item';
        li.textContent = item.title;
        list.appendChild(li);
    });
}

/**
 * 予約中一覧画面のタイトルと一覧を描画する
 */
function renderReservationsScreen() {
    const reservedBooks = allBooks.filter(function (book) {
        return isReservedNow(book.code, reservedCodes, reservationHistory);
    });

    const title = document.getElementById('reservations-title');
    title.textContent = '予約中一覧 (' + reservedBooks.length + '冊)';

    const list = document.getElementById('reservations-list');
    const emptyMessage = document.getElementById('reservations-empty');
    list.textContent = '';

    if (reservedBooks.length === 0) {
        list.hidden = true;
        emptyMessage.hidden = false;
        return;
    }

    list.hidden = false;
    emptyMessage.hidden = true;
    reservedBooks.forEach(function (book) {
        list.appendChild(createReservationRow(book));
    });
}

/**
 * 予約中一覧画面の1行分(アコーディオン＋取消ボタン)のDOM要素を作成する
 */
function createReservationRow(book) {
    const dueDate = getReservationDueDate(book.code, reservedCodes, reservationHistory);

    const details = document.createElement('details');
    details.className = 'book-item';

    const summary = document.createElement('summary');

    const titleSpan = document.createElement('span');
    titleSpan.className = 'book-title';
    titleSpan.textContent = book.title;
    summary.appendChild(titleSpan);

    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.textContent = '﹀';
    summary.appendChild(chevron);

    details.appendChild(summary);

    const detail = document.createElement('div');
    detail.className = 'book-detail';
    detail.appendChild(createDetailRow('著者', book.author, false));
    detail.appendChild(createDetailRow('予約期限日', dueDate || '不明', false));

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'cancel-reserve-btn';
    cancelBtn.textContent = '予約を取り消す';
    cancelBtn.addEventListener('click', function () {
        handleCancelReservation(book);
    });
    detail.appendChild(cancelBtn);

    details.appendChild(detail);

    return details;
}

/**
 * 予約中一覧画面の取消ボタン押下時、確認のうえ予約を取り消し一覧を再描画する
 */
function handleCancelReservation(book) {
    const confirmed = window.confirm('「' + book.title + '」の予約を取り消しますか？');
    if (!confirmed) {
        return;
    }
    cancelReservation(book.code);
    renderReservationsScreen();
}

/**
 * 指定コードの予約（初期データ由来・アプリ内作成の両方）を取り消す
 */
function cancelReservation(code) {
    if (findReservationEntry(code, reservedCodes) !== null) {
        cancelledReservationCodes.push(code);
        saveCancelledReservationCodes(cancelledReservationCodes);
        reservedCodes = reservedCodes.filter(function (entry) { return entry.code !== code; });
    }

    let historyChanged = false;
    reservationHistory.forEach(function (record) {
        if (record.code === code && record.status === RESERVATION_STATUS_ACTIVE) {
            record.status = RESERVATION_STATUS_CANCELLED;
            historyChanged = true;
        }
    });
    if (historyChanged) {
        saveReservationHistory(reservationHistory);
    }
}

/**
 * 起動時の初期化処理。データの読み込みとイベント登録を行う
 */
async function init() {
    try {
        allBooks = await loadBooks();
        reservedCodes = await loadReservations();
    } catch (e) {
        window.alert('データの読み込みに失敗しました: ' + e.message);
        return;
    }
    loanHistory = getLoanHistory();
    reservationHistory = getReservationHistory();
    cancelledReservationCodes = getCancelledReservationCodes();
    reservedCodes = reservedCodes.filter(function (entry) {
        return cancelledReservationCodes.indexOf(entry.code) === -1;
    });

    document.getElementById('home-lend-btn').addEventListener('click', function () {
        startMode('貸出');
    });
    document.getElementById('home-return-btn').addEventListener('click', function () {
        startMode('返却');
    });
    document.getElementById('home-reserve-btn').addEventListener('click', startReserve);
    document.getElementById('scan-start-btn').addEventListener('click', beginScan);
    document.getElementById('scan-cancel-btn').addEventListener('click', goHome);
    document.getElementById('confirm-submit-btn').addEventListener('click', handleConfirmSubmit);
    document.getElementById('confirm-cancel-btn').addEventListener('click', goHome);
    document.getElementById('complete-home-btn').addEventListener('click', goHome);
    document.getElementById('home-books-btn').addEventListener('click', function () {
        renderBooksScreen();
        showScreen('screen-books');
    });
    document.getElementById('home-loans-btn').addEventListener('click', function () {
        renderLoansScreen();
        showScreen('screen-loans');
    });
    document.getElementById('home-reservations-btn').addEventListener('click', function () {
        renderReservationsScreen();
        showScreen('screen-reservations');
    });
    document.getElementById('books-back-btn').addEventListener('click', goHome);
    document.getElementById('loans-back-btn').addEventListener('click', goHome);
    document.getElementById('reservations-back-btn').addEventListener('click', goHome);
    document.getElementById('reserve-select-next-btn').addEventListener('click', handleReserveSelectNext);
    document.getElementById('reserve-select-cancel-btn').addEventListener('click', goHome);
    document.getElementById('reserve-date-submit-btn').addEventListener('click', handleReserveDateSubmit);
    document.getElementById('reserve-date-cancel-btn').addEventListener('click', goHome);
    document.getElementById('reserve-complete-home-btn').addEventListener('click', goHome);

    showScreen('screen-home');
}

document.addEventListener('DOMContentLoaded', init);
