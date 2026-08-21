// 画面遷移とスキャン・確認・確定処理を制御するメインスクリプト

let allBooks = [];
let reservedCodes = [];
let loanHistory = [];
let currentMode = null; // '貸出' または '返却'
let confirmItems = [];  // 確認画面に表示する本のリスト

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
            items.push({
                code: book.code,
                title: book.title,
                author: book.author,
                genre: book.genre,
                loanDate: getTodayString(),
                dueDate: addDaysToToday(LOAN_PERIOD_DAYS),
                hasReservation: isReserved(book.code, reservedCodes)
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
                hasReservation: isReserved(book.code, reservedCodes)
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
        p.textContent = '予約が入っている本があります。予約者への連絡をお願いします。';
        notice.appendChild(p);

        const ul = document.createElement('ul');
        reservedItems.forEach(function (item) {
            const li = document.createElement('li');
            li.textContent = item.title;
            ul.appendChild(li);
        });
        notice.appendChild(ul);
        notice.hidden = false;
    } else {
        notice.hidden = true;
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

    document.getElementById('home-lend-btn').addEventListener('click', function () {
        startMode('貸出');
    });
    document.getElementById('home-return-btn').addEventListener('click', function () {
        startMode('返却');
    });
    document.getElementById('scan-start-btn').addEventListener('click', beginScan);
    document.getElementById('scan-cancel-btn').addEventListener('click', goHome);
    document.getElementById('confirm-submit-btn').addEventListener('click', handleConfirmSubmit);
    document.getElementById('confirm-cancel-btn').addEventListener('click', goHome);
    document.getElementById('complete-home-btn').addEventListener('click', goHome);

    showScreen('screen-home');
}

document.addEventListener('DOMContentLoaded', init);
