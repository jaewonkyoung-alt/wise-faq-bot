(function () {
  'use strict';

  var TOKEN_KEY = 'wise_admin_token';
  var state = {
    token: '',
    unlocked: false,
    grads: [],
    gradCriteria: null,
    clubs: [],
    unanswered: [],
    notices: [],
    subscribers: null,
    delivered: {},
  };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function toast(msg, kind) {
    var el = $('toast');
    el.textContent = typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2);
    el.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.className = '';
    }, 4200);
  }

  function authHeaders() {
    var h = { 'Content-Type': 'application/json' };
    if (state.token) h['x-admin-token'] = state.token;
    return h;
  }

  function koreanAuthError(data, status) {
    var err = (data && data.error) || '';
    if (err === 'admin_token_not_configured') {
      return '서버에 ADMIN_TOKEN이 설정되지 않았습니다. .env를 확인하세요.';
    }
    if (err === 'unauthorized' || status === 401) {
      return '인증 실패: 관리자 토큰이 올바르지 않습니다.';
    }
    return (data && (data.message || data.error)) || ('요청 실패 (' + status + ')');
  }

  async function api(path, opts) {
    opts = opts || {};
    var res = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.noAuth ? (opts.headers || {}) : Object.assign({}, authHeaders(), opts.headers || {}),
      body: opts.body != null ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined,
    });
    var data = null;
    var text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = { raw: text };
    }
    return { ok: res.ok, status: res.status, data: data };
  }

  /* ── Login ── */
  function showLogin(errMsg) {
    state.unlocked = false;
    $('app').classList.remove('unlocked');
    $('login-gate').style.display = '';
    var err = $('login-error');
    if (errMsg) {
      err.textContent = errMsg;
      err.classList.add('visible');
    } else {
      err.textContent = '';
      err.classList.remove('visible');
    }
  }

  function showApp() {
    state.unlocked = true;
    $('login-gate').style.display = 'none';
    $('app').classList.add('unlocked');
  }

  async function unlock() {
    var token = ($('login-token').value || '').trim();
    if (!token) {
      showLogin('토큰을 입력해 주세요.');
      return;
    }
    state.token = token;
    var r = await api('/api/admin/graduation');
    if (!r.ok) {
      state.token = '';
      sessionStorage.removeItem(TOKEN_KEY);
      showLogin(koreanAuthError(r.data, r.status));
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, token);
    showApp();
    state.grads = (r.data && r.data.requirements) || [];
    state.gradCriteria = (r.data && r.data.criteria) || null;
    await Promise.all([loadClubs(), loadNotices(), loadUnanswered(), loadHealth()]);
    renderGradList();
    updateStats();
    toast('잠금 해제됨', 'ok');
  }

  function lock() {
    state.token = '';
    state.unlocked = false;
    state.grads = [];
    state.clubs = [];
    state.notices = [];
    sessionStorage.removeItem(TOKEN_KEY);
    $('login-token').value = '';
    showLogin();
  }

  /* ── Navigation ── */
  function showPage(name) {
    document.querySelectorAll('.page').forEach(function (p) {
      p.classList.toggle('active', p.id === 'page-' + name);
    });
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-page') === name);
    });
    if (name === 'dashboard') {
      loadHealth();
      updateStats();
    }
    if (name === 'graduation') renderGradList();
    if (name === 'clubs') renderClubList();
    if (name === 'unanswered') loadUnanswered();
    if (name === 'notices') loadNotices();
  }

  /* ── Dashboard ── */
  function updateStats() {
    // 공식 기준 학과 수 + 수동 등록 건수
    var gc = state.gradCriteria;
    $('stat-grad').textContent = gc ? gc.departments + '개 학과' + (state.grads.length ? ' + 수동 ' + state.grads.length : '') : String(state.grads.length);
    $('stat-clubs').textContent = String(state.clubs.length);
    $('stat-unanswered').textContent = String(state.unanswered.length);
    var sn = document.getElementById('stat-notices');
    if (sn) sn.textContent = String(state.notices.length);
    var ss = document.getElementById('stat-subscribers');
    if (ss) ss.textContent = state.subscribers == null ? '—' : String(state.subscribers);
  }

  async function loadHealth() {
    try {
      var r = await api('/health', { noAuth: true });
      $('health-box').textContent = JSON.stringify(r.data, null, 2);
    } catch (e) {
      $('health-box').textContent = 'health 조회 실패: ' + e;
    }
  }

  async function scanKb() {
    var status = $('kb-scan-status');
    if (status) status.textContent = '스캔 중…';
    try {
      var r = await api('/api/admin/kb/scan');
      var g = r.data && r.data.graduation;
      var msg = g
        ? ('OK · 졸업요건 ' + g.entryCount + '건 · 학과 ' + (g.departments || []).join(', '))
        : 'OK';
      if (status) status.textContent = msg;
      if ($('health-box')) {
        $('health-box').textContent = JSON.stringify(r.data, null, 2);
      }
    } catch (e) {
      if (status) status.textContent = '실패: ' + e;
    }
  }

  /* ── Graduation format (mirrors server formatGraduationAnswer) ── */
  function formatGraduationAnswer(row) {
    var lines = [
      '【졸업요건】 ' + row.admission_year + '학번 · ' + row.department +
        (row.major_type ? ' (' + row.major_type + ')' : ''),
      row.total_credits != null ? '· 총 이수학점: ' + row.total_credits : null,
      row.major_credits != null ? '· 전공 학점: ' + row.major_credits : null,
      row.general_credits != null ? '· 교양 학점: ' + row.general_credits : null,
      row.track ? '· 트랙: ' + row.track : null,
      row.thesis_required == null
        ? null
        : '· 졸업논문/작품: ' + (row.thesis_required ? '필수' : '해당 없음'),
      row.english_requirement ? '· 영어/외국어: ' + row.english_requirement : null,
      row.license_requirement ? '· 자격/면허: ' + row.license_requirement : null,
      row.notes ? '· 비고: ' + row.notes : null,
      '',
      '[출처]',
      row.source_url ? '· ' + row.source_url : '· (출처 URL 없음)',
      row.verified_at ? '· verified_at: ' + row.verified_at : '· verified_at: (미확인)',
      '· updated_at: ' + (row.updated_at || '(저장 후 표시)'),
    ].filter(function (x) { return x != null; });
    return lines.join('\n');
  }

  function isPlaceholder(row) {
    return String(row.notes || '').indexOf('PLACEHOLDER') !== -1;
  }

  function numOrNull(v) {
    if (v === '' || v == null) return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function readGradForm() {
    var thesis = $('g_thesis').value;
    return {
      admission_year: Number($('g_year').value),
      department: $('g_department').value.trim(),
      major_type: $('g_major_type').value.trim() || '전공',
      total_credits: numOrNull($('g_total').value),
      major_credits: numOrNull($('g_major').value),
      general_credits: numOrNull($('g_general').value),
      track: $('g_track').value.trim() || null,
      thesis_required: thesis === '' ? null : thesis === 'true',
      english_requirement: $('g_english').value.trim() || null,
      license_requirement: $('g_license').value.trim() || null,
      notes: $('g_notes').value.trim() || null,
      source_url: $('g_source_url').value.trim() || null,
      verified_at: $('g_verified').value.trim() || null,
    };
  }

  function resetGradForm() {
    $('g_editId').value = '';
    $('g_year').value = '';
    $('g_department').value = '';
    $('g_major_type').value = '전공';
    $('g_total').value = '';
    $('g_major').value = '';
    $('g_general').value = '';
    $('g_notes').value = '';
    $('g_source_url').value = '';
    $('g_verified').value = '';
    $('g_track').value = '';
    $('g_thesis').value = '';
    $('g_english').value = '';
    $('g_license').value = '';
    $('grad-form-title').textContent = '졸업요건 추가';
    $('kakao-preview').textContent =
      '입학연도·학과를 입력하거나 목록에서 선택 후 「카톡 미리보기」를 누르세요.';
  }

  function fillGrad(r) {
    $('g_editId').value = r.id;
    $('g_year').value = r.admission_year;
    $('g_department').value = r.department || '';
    $('g_major_type').value = r.major_type || '전공';
    $('g_total').value = r.total_credits != null ? r.total_credits : '';
    $('g_major').value = r.major_credits != null ? r.major_credits : '';
    $('g_general').value = r.general_credits != null ? r.general_credits : '';
    $('g_notes').value = r.notes || '';
    $('g_source_url').value = r.source_url || '';
    $('g_verified').value = r.verified_at || '';
    $('g_track').value = r.track || '';
    $('g_thesis').value =
      r.thesis_required === null || r.thesis_required === undefined
        ? ''
        : String(r.thesis_required);
    $('g_english').value = r.english_requirement || '';
    $('g_license').value = r.license_requirement || '';
    $('grad-form-title').textContent = '졸업요건 수정';
    $('kakao-preview').textContent = formatGraduationAnswer(r);
    showPage('graduation');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function populateYearFilter() {
    var sel = $('filter-year');
    var cur = sel.value;
    var years = [];
    state.grads.forEach(function (r) {
      if (years.indexOf(r.admission_year) === -1) years.push(r.admission_year);
    });
    years.sort(function (a, b) { return b - a; });
    sel.innerHTML =
      '<option value="">전체</option>' +
      years
        .map(function (y) {
          return '<option value="' + y + '">' + y + '</option>';
        })
        .join('');
    if (cur) sel.value = cur;
  }

  function filteredGrads() {
    var year = $('filter-year').value;
    var dept = ($('filter-dept').value || '').trim().toLowerCase();
    return state.grads.filter(function (r) {
      if (year && String(r.admission_year) !== year) return false;
      if (dept && String(r.department || '').toLowerCase().indexOf(dept) === -1) return false;
      return true;
    });
  }

  function renderGradList() {
    populateYearFilter();
    var rows = filteredGrads();
    var tbody = $('g_list');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">등록된 항목이 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(function (r) {
        var ph = isPlaceholder(r)
          ? ' <span class="badge badge-ph">PLACEHOLDER</span>'
          : '';
        var extra = [];
        if (r.track) extra.push(escapeHtml(r.track));
        if (r.thesis_required === true) extra.push('논문 필수');
        if (r.thesis_required === false) extra.push('논문 해당없음');
        if (r.english_requirement) extra.push(escapeHtml(r.english_requirement));
        return (
          '<tr>' +
          '<td><div class="row-title">' +
          escapeHtml(r.department) +
          ph +
          '</div><div class="muted">' +
          r.admission_year +
          ' · ' +
          escapeHtml(r.major_type || '') +
          '</div></td>' +
          '<td class="muted">총 ' +
          (r.total_credits != null ? r.total_credits : '-') +
          ' / 전공 ' +
          (r.major_credits != null ? r.major_credits : '-') +
          ' / 교양 ' +
          (r.general_credits != null ? r.general_credits : '-') +
          '</td>' +
          '<td class="muted">' +
          (extra.join(' · ') || '—') +
          '</td>' +
          '<td class="actions">' +
          '<button type="button" class="btn btn-sm btn-secondary" data-act="edit-grad" data-id="' +
          escapeHtml(r.id) +
          '">수정</button> ' +
          '<button type="button" class="btn btn-sm btn-danger" data-act="del-grad" data-id="' +
          escapeHtml(r.id) +
          '">삭제</button>' +
          '</td></tr>'
        );
      })
      .join('');
  }

  async function loadGrads() {
    var r = await api('/api/admin/graduation');
    if (!r.ok) {
      if (r.status === 401) {
        lock();
        showLogin(koreanAuthError(r.data, r.status));
        return;
      }
      toast(koreanAuthError(r.data, r.status), 'error');
      return;
    }
    state.grads = (r.data && r.data.requirements) || [];
    state.gradCriteria = (r.data && r.data.criteria) || null;
    renderGradList();
    updateStats();
  }

  async function saveGrad() {
    var body = readGradForm();
    if (!Number.isFinite(body.admission_year) || !body.department) {
      toast('입학연도와 학과는 필수입니다.', 'error');
      return;
    }
    var id = $('g_editId').value;
    var r = await api(id ? '/api/admin/graduation/' + id : '/api/admin/graduation', {
      method: id ? 'PUT' : 'POST',
      body: body,
    });
    if (!r.ok) {
      toast(koreanAuthError(r.data, r.status), 'error');
      return;
    }
    toast(id ? '졸업요건이 수정되었습니다.' : '졸업요건이 추가되었습니다.', 'ok');
    resetGradForm();
    await loadGrads();
    var row = r.data && r.data.requirement;
    if (row) $('kakao-preview').textContent = formatGraduationAnswer(row);
  }

  async function removeGrad(id) {
    if (!confirm('이 졸업요건을 삭제할까요?')) return;
    var r = await api('/api/admin/graduation/' + id, { method: 'DELETE' });
    if (!r.ok) {
      toast(koreanAuthError(r.data, r.status), 'error');
      return;
    }
    toast('삭제되었습니다.', 'ok');
    await loadGrads();
  }

  async function previewKakao() {
    var year = Number($('g_year').value);
    var dept = $('g_department').value.trim();
    if (!Number.isFinite(year) || !dept) {
      toast('미리보기를 위해 입학연도와 학과를 입력하세요.', 'error');
      return;
    }
    var qs =
      '/api/graduation?year=' +
      encodeURIComponent(year) +
      '&department=' +
      encodeURIComponent(dept);
    var major = $('g_major_type').value.trim();
    if (major) qs += '&major_type=' + encodeURIComponent(major);

    var r = await api(qs, { noAuth: true });
    if (r.ok && r.data && r.data.answer) {
      $('kakao-preview').textContent = r.data.answer;
      return;
    }
    // Fallback: format from form (unsaved draft)
    var draft = readGradForm();
    draft.updated_at = draft.updated_at || '(미저장)';
    if (r.status === 404 && r.data && r.data.answer) {
      $('kakao-preview').textContent =
        '※ DB에 아직 없음 — 폼 기준 미리보기\n\n' + formatGraduationAnswer(draft);
      return;
    }
    $('kakao-preview').textContent = formatGraduationAnswer(draft);
  }

  /* ── Clubs ── */
  function resetClubForm() {
    $('c_editId').value = '';
    ['c_name', 'c_category', 'c_contact', 'c_meeting', 'c_location', 'c_source', 'c_intro', 'c_activities'].forEach(
      function (id) {
        $(id).value = '';
      }
    );
    $('club-form-title').textContent = '동아리 추가';
  }

  function fillClub(c) {
    $('c_editId').value = c.id;
    $('c_name').value = c.name || '';
    $('c_category').value = c.category || '';
    $('c_contact').value = c.contact || '';
    $('c_meeting').value = c.meeting_time || '';
    $('c_location').value = c.location || '';
    $('c_source').value = c.source_url || '';
    $('c_intro').value = c.intro || '';
    $('c_activities').value = c.activities || '';
    $('club-form-title').textContent = '동아리 수정';
    showPage('clubs');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderClubList() {
    var tbody = $('c_list');
    if (!state.clubs.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">등록된 동아리가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = state.clubs
      .map(function (c) {
        return (
          '<tr>' +
          '<td><div class="row-title">' +
          escapeHtml(c.name) +
          '</div><div class="muted">' +
          escapeHtml(c.category) +
          '</div></td>' +
          '<td class="muted">' +
          escapeHtml(c.meeting_time || '-') +
          ' / ' +
          escapeHtml(c.location || '-') +
          '</td>' +
          '<td class="actions">' +
          '<button type="button" class="btn btn-sm btn-secondary" data-act="edit-club" data-id="' +
          escapeHtml(c.id) +
          '">수정</button> ' +
          '<button type="button" class="btn btn-sm btn-danger" data-act="del-club" data-id="' +
          escapeHtml(c.id) +
          '">삭제</button>' +
          '</td></tr>'
        );
      })
      .join('');
  }

  async function loadClubs() {
    var r = await api('/api/admin/clubs');
    if (!r.ok) {
      if (r.status === 401) {
        lock();
        showLogin(koreanAuthError(r.data, r.status));
        return;
      }
      toast(koreanAuthError(r.data, r.status), 'error');
      return;
    }
    state.clubs = (r.data && r.data.clubs) || [];
    renderClubList();
    updateStats();
  }

  async function saveClub() {
    var body = {
      name: $('c_name').value.trim(),
      category: $('c_category').value.trim(),
      contact: $('c_contact').value.trim() || null,
      meeting_time: $('c_meeting').value.trim() || null,
      location: $('c_location').value.trim() || null,
      source_url: $('c_source').value.trim(),
      intro: $('c_intro').value.trim(),
      activities: $('c_activities').value.trim(),
    };
    if (!body.name || !body.category || !body.intro || !body.activities || !body.source_url) {
      toast('이름, 분과, 소개, 활동, 출처 URL은 필수입니다.', 'error');
      return;
    }
    var id = $('c_editId').value;
    var r = await api(id ? '/api/admin/clubs/' + id : '/api/admin/clubs', {
      method: id ? 'PUT' : 'POST',
      body: body,
    });
    if (!r.ok) {
      toast(koreanAuthError(r.data, r.status), 'error');
      return;
    }
    toast(id ? '동아리가 수정·재임베딩되었습니다.' : '동아리가 추가·재임베딩되었습니다.', 'ok');
    resetClubForm();
    await loadClubs();
  }

  async function removeClub(id) {
    if (!confirm('이 동아리를 삭제할까요?')) return;
    var r = await api('/api/admin/clubs/' + id, { method: 'DELETE' });
    if (!r.ok) {
      toast(koreanAuthError(r.data, r.status), 'error');
      return;
    }
    toast('삭제되었습니다.', 'ok');
    await loadClubs();
  }

  async function reindexAll() {
    if (!confirm('전체 동아리를 재인덱싱할까요?')) return;
    toast('재인덱싱 중…');
    var r = await api('/api/admin/reindex', { method: 'POST', body: {} });
    if (!r.ok) {
      toast(koreanAuthError(r.data, r.status), 'error');
      return;
    }
    toast('재인덱싱 완료: ' + JSON.stringify(r.data), 'ok');
  }

  /* ── Unanswered ── */
  function formatSeoul(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      return (
        d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' KST'
      );
    } catch (_) {
      return String(iso);
    }
  }

  function renderUnanswered() {
    var tbody = $('u_list');
    if (!state.unanswered.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">미답변 로그가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = state.unanswered
      .map(function (u) {
        return (
          '<tr>' +
          '<td class="muted">' +
          escapeHtml(u.id) +
          '</td>' +
          '<td>' +
          escapeHtml(u.question) +
          '</td>' +
          '<td class="muted">' +
          escapeHtml(u.reason) +
          '</td>' +
          '<td class="muted">' +
          escapeHtml(u.route || '—') +
          '</td>' +
          '<td class="muted">' +
          escapeHtml(formatSeoul(u.created_at)) +
          '</td></tr>'
        );
      })
      .join('');
  }

  async function loadUnanswered() {
    var r = await api('/api/unanswered');
    if (!r.ok) {
      if (r.status === 401) {
        lock();
        showLogin(koreanAuthError(r.data, r.status));
        return;
      }
      toast(koreanAuthError(r.data, r.status) || '미답변 로드 실패', 'error');
      return;
    }
    state.unanswered = (r.data && r.data.items) || [];
    renderUnanswered();
    updateStats();
  }

  /* ── Notices ── */
  function readNoticeForm() {
    var starts = $('n_starts').value;
    var ends = $('n_ends').value;
    return {
      title: ($('n_title').value || '').trim(),
      body: ($('n_body').value || '').trim(),
      link_url: ($('n_link').value || '').trim() || null,
      pinned: $('n_pinned').checked,
      published: $('n_published').checked,
      starts_at: starts ? new Date(starts + 'T00:00:00').toISOString() : null,
      ends_at: ends ? new Date(ends + 'T23:59:59').toISOString() : null
    };
  }

  function resetNoticeForm() {
    $('n_editId').value = '';
    ['n_title', 'n_body', 'n_link', 'n_starts', 'n_ends'].forEach(function (id) {
      $(id).value = '';
    });
    $('n_published').checked = true;
    $('n_pinned').checked = false;
    $('notice-form-title').textContent = '공지 추가';
  }

  function fillNotice(n) {
    $('n_editId').value = n.id;
    $('n_title').value = n.title || '';
    $('n_body').value = n.body || '';
    $('n_link').value = n.link_url || '';
    $('n_starts').value = n.starts_at ? String(n.starts_at).slice(0, 10) : '';
    $('n_ends').value = n.ends_at ? String(n.ends_at).slice(0, 10) : '';
    $('n_published').checked = !!n.published;
    $('n_pinned').checked = !!n.pinned;
    $('notice-form-title').textContent = '공지 수정';
    window.scrollTo(0, 0);
  }

  function noticeStatus(n) {
    if (!n.published) return '초안';
    var now = new Date().toISOString();
    if (n.starts_at && n.starts_at > now) return '예약';
    if (n.ends_at && n.ends_at < now) return '종료';
    return '게시 중';
  }

  function renderNoticeList() {
    var tbody = $('n_list');
    if (!state.notices.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">등록된 공지가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = state.notices
      .map(function (n) {
        var period =
          (n.starts_at ? String(n.starts_at).slice(0, 10) : '—') +
          ' ~ ' +
          (n.ends_at ? String(n.ends_at).slice(0, 10) : '—');
        return (
          '<tr>' +
          '<td><div class="row-title">' +
          (n.pinned ? '[고정] ' : '') +
          escapeHtml(n.title) +
          '</div><div class="muted">' +
          escapeHtml(String(n.body).slice(0, 60)) +
          '</div></td>' +
          '<td class="muted">' +
          escapeHtml(noticeStatus(n)) +
          '</td>' +
          '<td class="muted">' +
          escapeHtml(period) +
          '</td>' +
          '<td class="muted">' +
          escapeHtml(String((state.delivered && state.delivered[n.id]) || 0)) +
          '명</td>' +
          '<td class="actions">' +
          '<button type="button" class="btn btn-sm btn-secondary" data-act="edit-notice" data-id="' +
          escapeHtml(n.id) +
          '">수정</button> ' +
          '<button type="button" class="btn btn-sm btn-danger" data-act="del-notice" data-id="' +
          escapeHtml(n.id) +
          '">삭제</button>' +
          '</td></tr>'
        );
      })
      .join('');
  }

  async function loadNotices() {
    var r = await api('/api/admin/notices');
    if (!r.ok) {
      if (r.status === 401) {
        lock();
        showLogin(koreanAuthError(r.data, r.status));
        return;
      }
      toast(koreanAuthError(r.data, r.status), 'error');
      return;
    }
    state.notices = (r.data && r.data.notices) || [];
    state.subscribers = r.data && typeof r.data.subscribers === 'number' ? r.data.subscribers : null;
    state.delivered = (r.data && r.data.delivered) || {};
    var nsub = document.getElementById('n_subscribers');
    if (nsub) nsub.textContent = state.subscribers == null ? '—' : String(state.subscribers);
    renderNoticeList();
    updateStats();
  }

  async function saveNotice() {
    var input = readNoticeForm();
    if (!input.title || !input.body) {
      toast('제목과 본문은 필수입니다.', 'error');
      return;
    }
    var id = $('n_editId').value;
    var r = await api(id ? '/api/admin/notices/' + id : '/api/admin/notices', {
      method: id ? 'PUT' : 'POST',
      body: input
    });
    if (!r.ok) {
      toast(koreanAuthError(r.data, r.status) || '저장 실패', 'error');
      return;
    }
    toast(id ? '공지 수정됨 · 카톡 반영' : '공지 등록됨 · 카톡 반영', 'ok');
    resetNoticeForm();
    loadNotices();
  }

  async function removeNotice(id) {
    if (!window.confirm('이 공지를 삭제할까요?')) return;
    var r = await api('/api/admin/notices/' + id, { method: 'DELETE' });
    if (!r.ok) {
      toast('삭제 실패', 'error');
      return;
    }
    toast('삭제됨', 'ok');
    loadNotices();
  }

  async function previewNotices() {
    var box = $('n_preview');
    var r = await api('/api/notices?limit=5', { noAuth: true });
    if (!r.ok) {
      box.textContent = '미리보기 실패';
      return;
    }
    var list = (r.data && r.data.notices) || [];
    if (!list.length) {
      box.textContent = '【공지】\n등록된 공지가 없습니다.';
      return;
    }
    box.textContent =
      '【공지】\n\n' +
      list
        .map(function (n) {
          var body = String(n.body).replace(/\s+/g, ' ').trim();
          return (
            '· ' +
            (n.pinned ? '[고정] ' : '') +
            n.title +
            '\n' +
            (body.length > 80 ? body.slice(0, 79) + '…' : body) +
            (n.link_url ? '\n링크: ' + n.link_url : '')
          );
        })
        .join('\n\n');
  }

  /* ── Events ── */
  function findById(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function bind() {
    $('btn-unlock').addEventListener('click', unlock);
    $('login-token').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') unlock();
    });
    $('btn-lock').addEventListener('click', lock);
    $('btn-lock-mobile').addEventListener('click', lock);

    document.querySelectorAll('.nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showPage(btn.getAttribute('data-page'));
      });
    });

    $('btn-refresh-health').addEventListener('click', loadHealth);
    var kbScanBtn = document.getElementById('btn-kb-scan');
    if (kbScanBtn) kbScanBtn.addEventListener('click', function () { scanKb(); });
    $('btn-grad-save').addEventListener('click', saveGrad);
    $('btn-grad-reset').addEventListener('click', resetGradForm);
    $('btn-grad-preview').addEventListener('click', previewKakao);
    $('btn-grad-reload').addEventListener('click', loadGrads);
    $('filter-year').addEventListener('change', renderGradList);
    $('filter-dept').addEventListener('input', renderGradList);

    $('btn-club-save').addEventListener('click', saveClub);
    $('btn-club-reset').addEventListener('click', resetClubForm);
    $('btn-club-reload').addEventListener('click', loadClubs);
    $('btn-reindex').addEventListener('click', reindexAll);

    $('btn-unanswered-reload').addEventListener('click', loadUnanswered);

    $('btn-notice-save').addEventListener('click', saveNotice);
    $('btn-notice-reset').addEventListener('click', resetNoticeForm);
    $('btn-notice-reload').addEventListener('click', loadNotices);
    $('btn-notice-preview').addEventListener('click', previewNotices);

    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var act = t.getAttribute('data-act');
      var id = t.getAttribute('data-id');
      if (!act || !id) return;
      if (act === 'edit-grad') {
        var g = findById(state.grads, id);
        if (g) fillGrad(g);
      } else if (act === 'del-grad') {
        removeGrad(id);
      } else if (act === 'edit-club') {
        var c = findById(state.clubs, id);
        if (c) fillClub(c);
      } else if (act === 'del-club') {
        removeClub(id);
      } else if (act === 'edit-notice') {
        var n = findById(state.notices, id);
        if (n) fillNotice(n);
      } else if (act === 'del-notice') {
        removeNotice(id);
      }
    });
  }

  function init() {
    bind();
    var saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      $('login-token').value = saved;
      unlock();
    } else {
      showLogin();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
