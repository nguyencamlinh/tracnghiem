(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.APP_CONFIG || {};
  const state = {
    view: 'home', token: sessionStorage.getItem('teacherToken') || '',
    playerId: sessionStorage.getItem('playerId') || '',
    playerKey: sessionStorage.getItem('playerKey') || '',
    poll: null, teacherPoll: null, serverOffset: 0, currentQuestionKey: '',
    currentQuestion: null, questionDirty: false, lastQuestionSignature: ''
  };
  let toastTimer;
  function toast(message) {
    const node = $('toast'); node.textContent = message; node.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
  }
  function setConnection(text, good = false) {
    $('connection').textContent = text;
    const dot = document.querySelector('.live-dot');
    if (dot) dot.style.background = good ? '#18b981' : '#e7a23b';
  }
  function api(action, data = {}) {
    return new Promise((resolve, reject) => {
      const url = String(cfg.API_URL || '').trim();
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec(?:\?.*)?$/.test(url)) {
        reject(new Error('Chưa cấu hình URL Web App Apps Script hợp lệ trong config.js.')); return;
      }
      const callback = 'dtt_cb_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      let finished = false;
      const finish = (error, result) => {
        if (finished) return; finished = true; clearTimeout(timer);
        try { delete window[callback]; } catch (_) { window[callback] = undefined; }
        script.remove(); error ? reject(error) : resolve(result);
      };
      const timer = setTimeout(() => finish(new Error('Máy chủ quá thời gian phản hồi. Kiểm tra URL triển khai và quyền truy cập Web App.')), 15000);
      window[callback] = result => finish(null, result);
      const params = new URLSearchParams();
      params.set('action', action); params.set('callback', callback); params.set('_', String(Date.now()));
      Object.entries(data).forEach(([key, value]) => params.set(key, value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value)));
      script.async = true; script.src = url + '?' + params.toString();
      script.onerror = () => finish(new Error('Không tải được Apps Script. Hãy kiểm tra URL /exec và quyền truy cập Anyone.'));
      document.head.appendChild(script);
    });
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function stopStudentPoll() { if (state.poll) clearInterval(state.poll); state.poll = null; }
  function stopTeacherPoll() { if (state.teacherPoll) clearInterval(state.teacherPoll); state.teacherPoll = null; }
  function show(view) {
    state.view = view;
    ['homeView','studentView','teacherView','podiumView'].forEach(id => $(id).classList.toggle('hidden', id !== view + 'View'));
    if (view === 'student') {
      if (state.playerId && state.playerKey) {
        $('studentJoin').classList.add('hidden');
        $('studentWaiting').classList.remove('hidden');
        startStudentPoll();
      } else resetStudent();
    }
    if (view === 'teacher') {
      $('teacherLogin').classList.toggle('hidden', !!state.token);
      $('teacherDash').classList.toggle('hidden', !state.token);
      if (state.token) { teacherRefresh(true); startTeacherPoll(); } else stopTeacherPoll();
    } else stopTeacherPoll();
  }
  function resetStudent() {
    $('studentJoin').classList.remove('hidden');
    $('studentWaiting').classList.add('hidden');
    $('studentQuiz').classList.add('hidden');
    $('studentDone').classList.add('hidden');
  }
  document.querySelectorAll('[data-home]').forEach(button => button.addEventListener('click', () => show('home')));
  $('homeBtn').addEventListener('click', () => show('home'));
  $('studentEnter').addEventListener('click', () => show('student'));
  $('teacherEnter').addEventListener('click', () => show('teacher'));

  $('joinBtn').addEventListener('click', async () => {
    const name = $('studentName').value.trim(), klass = $('studentClass').value.trim(), code = $('roomCode').value.trim().toUpperCase();
    if (!name || !klass || !code) return toast('Vui lòng nhập đầy đủ họ tên, lớp và mã phòng.');
    $('joinBtn').disabled = true;
    try {
      const result = await api('join', { code, name, klass });
      if (!result?.ok) throw new Error(result?.error || 'Không thể tham gia phòng thi.');
      state.playerId = result.playerId; state.playerKey = result.playerKey;
      sessionStorage.setItem('playerId', state.playerId); sessionStorage.setItem('playerKey', state.playerKey);
      $('studentJoin').classList.add('hidden'); $('studentWaiting').classList.remove('hidden');
      $('studentIdentity').textContent = name + ' • ' + klass;
      startStudentPoll(); toast('Kết nối thành công. Đang chờ giáo viên xác nhận.');
    } catch (error) { toast(error.message); }
    finally { $('joinBtn').disabled = false; }
  });
  const leave = document.createElement('button');
  leave.className = 'btn ghost small'; leave.textContent = 'Thoát phiên / đổi thí sinh';
  leave.addEventListener('click', () => {
    if (!confirm('Thoát phiên hiện tại trên thiết bị này?')) return;
    stopStudentPoll(); state.playerId = ''; state.playerKey = ''; state.currentQuestionKey = '';
    sessionStorage.removeItem('playerId'); sessionStorage.removeItem('playerKey'); resetStudent(); toast('Đã thoát phiên trên thiết bị này.');
  });
  $('studentWaiting').appendChild(leave);

  function startStudentPoll() {
    if (!state.playerId || !state.playerKey) return;
    stopStudentPoll(); studentRefresh(); state.poll = setInterval(studentRefresh, Math.max(2500, Number(cfg.POLL_MS) || 3500));
  }
  async function studentRefresh() {
    if (!state.playerId || state.view !== 'student') return;
    try {
      const result = await api('studentState', { playerId: state.playerId, playerKey: state.playerKey });
      if (!result?.ok) throw new Error(result?.error || 'Không tìm thấy phiên thi.');
      state.serverOffset = (Number(result.serverNow) || Date.now()) - Date.now();
      setConnection('Đã kết nối máy chủ', true);
      if (result.phase === 'waiting') {
        $('studentWaiting').classList.remove('hidden'); $('studentQuiz').classList.add('hidden'); $('studentDone').classList.add('hidden');
        $('studentStatus').textContent = result.approved ? 'ĐÃ ĐƯỢC XÁC NHẬN – CHỜ BẮT ĐẦU' : 'ĐANG CHỜ GIÁO VIÊN XÁC NHẬN';
        $('waitingTitle').textContent = result.approved ? 'Bạn đã có tên trong danh sách thi!' : 'Đã gửi yêu cầu tham gia!';
        $('waitingText').textContent = result.approved ? 'Giữ nguyên màn hình. Cuộc thi sẽ tự động bắt đầu khi giáo viên phát lệnh.' : 'Giáo viên đang kiểm tra danh sách thí sinh.';
      } else if (result.phase === 'running') {
        $('studentWaiting').classList.add('hidden'); $('studentDone').classList.add('hidden'); $('studentQuiz').classList.remove('hidden');
        renderQuestion(result);
      } else if (result.phase === 'finished') {
        $('studentWaiting').classList.add('hidden'); $('studentQuiz').classList.add('hidden'); $('studentDone').classList.remove('hidden');
        $('studentFinal').textContent = `Bạn trả lời đúng ${result.score || 0}/${result.total || 0} câu. ${result.rank ? 'Thứ hạng: ' + result.rank + '.' : 'Cảm ơn bạn đã tham gia!'} `;
        stopStudentPoll();
      }
    } catch (error) {
      setConnection('Đang thử kết nối lại', false);
      if (/phiên thi không hợp lệ|phòng thi đã đóng/i.test(error.message)) {
        $('waitingText').textContent = error.message + ' Bạn có thể thoát phiên để tham gia phòng mới.';
      }
    }
  }
  function renderQuestion(result) {
    const key = `${result.code}-${result.index}`;
    const signature = `${key}-${result.question?.text || ''}-${result.answered ? '1' : '0'}`;
    if (state.lastQuestionSignature !== signature) {
      state.lastQuestionSignature = signature; state.currentQuestion = result;
      $('quizRoom').textContent = 'PHÒNG ' + result.code;
      $('quizProgress').textContent = `CÂU ${result.index + 1}/${result.total}`;
      $('questionText').textContent = result.question.text;
      $('answerOptions').innerHTML = '';
      ['A','B','C','D'].forEach((letter, index) => {
        const button = document.createElement('button'); button.className = 'answer';
        const keyLabel = document.createElement('span'); keyLabel.className = 'answer-key'; keyLabel.textContent = letter;
        const label = document.createElement('span'); label.className = 'answer-label'; label.textContent = result.question.options[index];
        button.append(keyLabel, label); button.disabled = !!result.answered;
        button.addEventListener('click', () => submitAnswer(letter, button));
        if (result.selected === letter) button.classList.add('selected');
        $('answerOptions').appendChild(button);
      });
      $('answerNotice').textContent = result.answered ? '✓ Đã ghi nhận câu trả lời. Hãy chờ câu tiếp theo.' : 'Chọn một phương án. Mỗi câu chỉ được ghi nhận một lần.';
      $('studentQuiz').classList.remove('question-enter'); void $('studentQuiz').offsetWidth; $('studentQuiz').classList.add('question-enter');
    }
    const duration = Math.max(1, Number(result.duration) || 30);
    const elapsed = Math.max(0, (Date.now() + state.serverOffset - Number(result.questionStartedAt)) / 1000);
    const remain = Math.max(0, duration - elapsed);
    $('timer').textContent = Math.ceil(remain);
    $('timerBar').style.width = (remain / duration * 100) + '%';
    $('timer').classList.toggle('urgent', remain <= 5);
  }
  async function submitAnswer(choice, button) {
    document.querySelectorAll('.answer').forEach(item => item.disabled = true);
    try {
      const result = await api('answer', { playerId: state.playerId, playerKey: state.playerKey, choice });
      if (!result?.ok) throw new Error(result?.error || 'Không ghi nhận được đáp án.');
      button.classList.add('selected'); $('answerNotice').textContent = '✓ Đáp án đã được ghi nhận thành công.';
    } catch (error) { toast(error.message); document.querySelectorAll('.answer').forEach(item => item.disabled = false); }
  }

  async function sha256(value) {
    if (!crypto?.subtle) throw new Error('Trình duyệt cần chạy trang trên HTTPS để mã hóa đăng nhập.');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  $('loginBtn').addEventListener('click', teacherLogin);
  $('teacherPass').addEventListener('keydown', event => { if (event.key === 'Enter') teacherLogin(); });
  $('teacherUser').addEventListener('keydown', event => { if (event.key === 'Enter') $('teacherPass').focus(); });
  async function teacherLogin() {
    const user = $('teacherUser').value.trim(), pass = $('teacherPass').value;
    if (!user || !pass) return toast('Vui lòng nhập tài khoản và mật khẩu.');
    $('loginBtn').disabled = true; $('loginBtn').textContent = 'ĐANG XÁC THỰC…';
    try {
      const passHash = await sha256(pass);
      const result = await api('login', { user, passHash });
      if (!result?.ok) throw new Error(result?.error || 'Đăng nhập không thành công.');
      state.token = result.token; sessionStorage.setItem('teacherToken', result.token);
      $('teacherLogin').classList.add('hidden'); $('teacherDash').classList.remove('hidden');
      await teacherRefresh(true); startTeacherPoll(); toast('Đăng nhập thành công.');
    } catch (error) { toast(error.message); }
    finally { $('loginBtn').disabled = false; $('loginBtn').textContent = 'ĐĂNG NHẬP HỆ THỐNG'; }
  }
  $('logoutBtn').addEventListener('click', () => {
    state.token = ''; sessionStorage.removeItem('teacherToken'); stopTeacherPoll();
    $('teacherLogin').classList.remove('hidden'); $('teacherDash').classList.add('hidden'); $('teacherPass').value = '';
    toast('Đã đăng xuất.');
  });
  const authData = extra => ({ token: state.token, ...(extra || {}) });
  $('createRoomBtn').addEventListener('click', async () => {
    if (!confirm('Tạo phòng thi mới? Danh sách thí sinh và kết quả của phòng hiện tại sẽ được làm mới.')) return;
    await teacherAction('createRoom', {}, 'Đã tạo phòng thi mới.');
  });
  $('startBtn').addEventListener('click', async () => {
    if (!confirm('Bắt đầu cuộc thi? Hãy chắc chắn đã xác nhận đủ thí sinh và lưu câu hỏi.')) return;
    await teacherAction('start', {}, 'Cuộc thi đã bắt đầu!');
  });
  $('endBtn').addEventListener('click', async () => {
    if (!confirm('Kết thúc cuộc thi ngay bây giờ?')) return;
    await teacherAction('end', {}, 'Đã kết thúc cuộc thi.');
  });
  $('approveAllBtn').addEventListener('click', async () => {
    if (!confirm('Xác nhận tất cả thí sinh đang có trong phòng?')) return;
    await teacherAction('approveAll', {}, 'Đã xác nhận tất cả thí sinh.');
  });
  $('refreshBtn').addEventListener('click', () => teacherRefresh(true));
  $('copyRoomBtn').addEventListener('click', async () => {
    const code = $('roomCodeDisplay').textContent.trim();
    if (!code || code.includes('—')) return toast('Chưa có mã phòng để sao chép.');
    try { await navigator.clipboard.writeText(code); toast('Đã sao chép mã phòng.'); }
    catch (_) { toast('Trình duyệt không cho phép sao chép tự động.'); }
  });
  async function teacherAction(action, extra, success) {
    try { const result = await api(action, authData(extra)); if (!result?.ok) throw new Error(result?.error || 'Thao tác thất bại.');
      toast(success); await teacherRefresh(true);
    } catch (error) { toast(error.message); if (/phiên đăng nhập hết hạn/i.test(error.message)) expireTeacherSession(); }
  }
  function expireTeacherSession() {
    state.token = ''; sessionStorage.removeItem('teacherToken'); stopTeacherPoll();
    $('teacherLogin').classList.remove('hidden'); $('teacherDash').classList.add('hidden'); toast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  }
  $('questionCount').addEventListener('change', () => {
    const count = Math.max(1, Math.min(30, Number($('questionCount').value) || 6));
    $('questionCount').value = count; renderEditor(count); state.questionDirty = true;
  });
  $('addQuestionBtn').addEventListener('click', () => {
    $('questionCount').value = Math.min(30, (Number($('questionCount').value) || 6) + 1);
    renderEditor(Number($('questionCount').value)); state.questionDirty = true;
  });
  function renderEditor(count, items = []) {
    const root = $('questionEditor'); root.innerHTML = '';
    for (let index = 0; index < count; index++) {
      const question = items[index] || { text: '', options: ['', '', '', ''], correct: 'A' };
      const block = document.createElement('div'); block.className = 'question-item';
      block.innerHTML = `<div class="question-item-head"><h4> CÂU HỎI ${index + 1}</h4><span class="tag">${index + 1}/${count}</span></div>
        <textarea class="qtext" maxlength="1000" placeholder="Nhập nội dung câu hỏi…">${esc(question.text)}</textarea>
        <div class="option-grid">${['A','B','C','D'].map((letter, optionIndex) => `<label class="option"><input type="radio" name="correct${index}" value="${letter}" ${question.correct === letter ? 'checked' : ''}><b>${letter}</b><input class="opt" maxlength="300" placeholder="Phương án ${letter}" value="${esc(question.options?.[optionIndex] || '')}"></label>`).join('')}</div>`;
      root.appendChild(block);
    }
    root.querySelectorAll('input,textarea').forEach(input => input.addEventListener('input', () => state.questionDirty = true));
    root.querySelectorAll('input[type=radio]').forEach(input => input.addEventListener('change', () => state.questionDirty = true));
  }
  function collectQuestions() {
    return [...$('questionEditor').querySelectorAll('.question-item')].map(block => ({
      text: block.querySelector('.qtext').value.trim(),
      options: [...block.querySelectorAll('.opt')].map(input => input.value.trim()),
      correct: block.querySelector('input[type=radio]:checked')?.value || 'A'
    }));
  }
  $('saveQuestionsBtn').addEventListener('click', async () => {
    const questions = collectQuestions(), duration = Math.max(5, Math.min(180, Number($('questionDuration').value) || 30));
    if (questions.some(question => !question.text || question.options.some(option => !option))) return toast('Mỗi câu cần nội dung và đủ 4 phương án.');
    $('saveQuestionsBtn').disabled = true;
    try {
      const result = await api('saveQuestions', authData({ questions, duration }));
      if (!result?.ok) throw new Error(result?.error || 'Không lưu được câu hỏi.');
      state.questionDirty = false; toast(`Đã lưu ${result.total || questions.length} câu hỏi.`); await teacherRefresh(true);
    } catch (error) { toast(error.message); }
    finally { $('saveQuestionsBtn').disabled = false; }
  });
  function startTeacherPoll() {
    stopTeacherPoll(); if (!state.token) return;
    state.teacherPoll = setInterval(() => teacherRefresh(false), Math.max(3000, Number(cfg.TEACHER_POLL_MS) || 5000));
  }
  async function teacherRefresh(forceEditor = false) {
    if (!state.token) return;
    try {
      const result = await api('teacherState', authData());
      if (!result?.ok) throw new Error(result?.error || 'Không tải được dữ liệu điều khiển.');
      setConnection('Giáo viên đang trực tuyến', true);
      const room = result.room, players = result.players || [];
      $('statRoom').textContent = room?.code || 'Chưa tạo'; $('roomCodeDisplay').textContent = room?.code || '— — — —';
      $('statPlayers').textContent = `${players.length}/24`; $('statApproved').textContent = `${players.filter(player => player.approved).length}/24`;
      $('statPhase').textContent = ({ waiting: 'Đang chờ', running: 'Đang thi', finished: 'Đã kết thúc' })[room?.phase] || 'Chưa tạo';
      $('playerCountTag').textContent = `${players.length} / 24`;
      $('startBtn').disabled = !(room && room.phase === 'waiting' && players.length === 24 && players.every(player => player.approved) && (result.questions || []).length);
      $('endBtn').disabled = !(room && room.phase === 'running');
      renderPlayers(players); renderLeaderboard(result.results || []);
      window.__DTT_LAST_RESULTS = result.results || [];
      $('podiumBtn').disabled = !(room && room.phase === 'finished' && (result.results || []).length > 0);
      if (forceEditor || !state.questionDirty) {
        const questions = result.questions || []; $('questionCount').value = questions.length || 6;
        $('questionDuration').value = result.duration || 30; renderEditor(questions.length || 6, questions); state.questionDirty = false;
      }
      if (room?.phase === 'finished') renderFinal(result.results || []);
    } catch (error) {
      setConnection('Mất kết nối máy chủ', false);
      if (/phiên đăng nhập hết hạn/i.test(error.message)) expireTeacherSession();
      else console.warn('teacherRefresh:', error);
    }
  }
  function renderPlayers(players) {
    const body = $('playersTable');
    if (!players.length) { body.innerHTML = '<tr><td colspan="6" class="muted center">Chưa có thí sinh kết nối</td></tr>'; return; }
    body.innerHTML = players.map((player, index) => `<tr><td>${index + 1}</td><td><b>${esc(player.name)}</b></td><td>${esc(player.klass)}</td><td>${esc(player.device || 'Thiết bị web')}</td><td>${player.approved ? '<span class="status-pill approved">ĐÃ XÁC NHẬN</span>' : '<span class="status-pill pending">CHỜ DUYỆT</span>'}</td><td>${player.approved ? '✓' : `<button class="btn secondary small" data-approve="${esc(player.id)}">Duyệt</button>`}</td></tr>`).join('');
    body.querySelectorAll('[data-approve]').forEach(button => button.addEventListener('click', async () => {
      try { const result = await api('approve', authData({ playerId: button.dataset.approve })); if (!result?.ok) throw new Error(result?.error || 'Không duyệt được.'); await teacherRefresh(false); toast('Đã xác nhận thí sinh.'); }
      catch (error) { toast(error.message); }
    }));
  }
  function renderLeaderboard(rows) {
    $('leaderboard').innerHTML = rows.length ? rows.slice(0, 10).map((player, index) => `<div class="leader-row"><span class="rank">${['🥇','🥈','🥉'][index] || index + 1}</span><span><b>${esc(player.name)}</b><small class="muted">${esc(player.klass || '')}</small></span><b class="score">${player.score} điểm <small>${Number(player.time || 0).toFixed(1)}s</small></b></div>`).join('') : '<p class="muted">Kết quả sẽ xuất hiện sau cuộc thi.</p>';
  }
  function renderFinal(rows) {
    $('podium').innerHTML = [1, 0, 2].map((rowIndex, position) => {
      const player = rows[rowIndex]; if (!player) return '';
      return `<div class="podium-place ${position === 0 ? 'first' : position === 1 ? 'second' : 'third'}"><div class="medal">${['🥇','🥈','🥉'][position]}</div><b>${esc(player.name)}</b><small>${esc(player.klass || '')} • ${player.score} điểm</small><div class="podium-block">${['QUÁN QUÂN','Á QUÂN','HẠNG BA'][position]}</div></div>`;
    }).join('');
    $('finalBoard').innerHTML = rows.map((player, index) => `<div class="leader-row"><span class="rank">${index + 1}</span><span>${esc(player.name)} <small class="muted">${esc(player.klass || '')}</small></span><b class="score">${player.score} điểm • ${Number(player.time || 0).toFixed(1)}s</b></div>`).join('');
  }
  $('podiumBtn').addEventListener('click', () => {
    const rows = window.__DTT_LAST_RESULTS || []; renderFinal(rows); show('podium');
  });
  $('backTeacherBtn').addEventListener('click', () => show('teacher'));
  $('exportBtn').addEventListener('click', async () => {
    try {
      const result = await api('teacherState', authData()); if (!result?.ok) throw new Error(result?.error || 'Không tải được kết quả.');
      const rows = result.results || [];
      const csv = ['Hạng,Họ tên,Lớp,Điểm,Số câu đúng,Tổng thời gian (giây)', ...rows.map((player, index) => [index + 1, player.name, player.klass, player.score, player.correct, player.time].map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(','))].join('\r\n');
      const blobUrl = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = blobUrl; link.download = 'ket-qua-dau-truong-tri-thuc.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (error) { toast(error.message); }
  });

  $('questionDuration').addEventListener('input', () => state.questionDirty = true);
  renderEditor(6);
  if (state.playerId && state.playerKey) show('student');
  else if (state.token) show('teacher');
  else show('home');
  if (!cfg.API_URL || String(cfg.API_URL).includes('PASTE_')) setConnection('Chưa cấu hình máy chủ', false);
  else api('health').then(result => { if (result?.ok) setConnection('Máy chủ sẵn sàng', true); else setConnection('Kiểm tra máy chủ', false); }).catch(() => setConnection('Chưa kết nối được máy chủ', false));
})();
