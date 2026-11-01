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
      scanKb();
    }
    if (name === 'graduation') {
      renderGradList();
      if (!state.critDepts) loadCriteria();
      loadImportHistory();
    }
    if (name === 'clubs') {
      renderClubList();
      if (!state.keywords) loadKeywords();
      loadClubImportHistory();
    }
    if (name === 'unanswered') loadUnanswered();
    if (name === 'notices') loadNotices();
  }

  /* ── Dashboard ── */
  function updateStats() {
    // 공식 기준 학과 수 + 수동 등록 건수
    var gc = state.gradCriteria;
    $('stat-grad').textContent = gc ? gc.departments + '개 학과' + (state.grads.length ? ' + 수동 ' + state.grads.length : '') : String(state.grads.length);
    $('stat-clubs').textContent = String(state.clubs.length);
    $('stat-unanswered').textContent = state.uCounts ? String(state.uCounts.new || 0) : String(state.unanswered.length);
    var sn = document.getElementById('stat-notices');
    if (sn) sn.textContent = String(state.noticeLiveCount != null ? state.noticeLiveCount : state.notices.length);
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
    status.textContent = '· 점검 중…';
    var r = await api('/api/admin/kb/scan');
    if (!r.ok) {
      status.textContent = '· 점검 실패';
      return;
    }
    var d = r.data;
    status.textContent = '· ' + (d.warningCount ? '확인할 것 ' + d.warningCount + '건' : '문제 없음') + ' (' + shortTime(d.scannedAt) + ')';
    $('kb-check').innerHTML = (d.sections || []).map(function (sec) {
      return '<div class="imp-file"><h3>' + escapeHtml(sec.title) + '</h3>' +
        sec.facts.map(function (f) { return '<p class="imp-ok">✓ ' + escapeHtml(f) + '</p>'; }).join('') +
        sec.warnings.map(function (w) { return '<p class="imp-warn">⚠ ' + escapeHtml(w) + '</p>'; }).join('') +
        '</div>';
    }).join('');
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

  /* ── 공식 졸업기준 (조회) ── */
  async function loadCriteria() {
    var r = await api('/api/admin/graduation/criteria');
    if (!r.ok) {
      toast(koreanAuthError(r.data, r.status), 'error');
      return;
    }
    state.critDepts = (r.data && r.data.departments) || [];
    $('crit-summary').textContent = '· ' + state.critDepts.length + '개 학과';
    var sel = $('crit-college');
    var cur = sel.value;
    var colleges = [];
    state.critDepts.forEach(function (d) {
      if (d.college && colleges.indexOf(d.college) === -1) colleges.push(d.college);
    });
    sel.innerHTML = '<option value="">전체</option>' + colleges.map(function (c) {
      return '<option>' + escapeHtml(c) + '</option>';
    }).join('');
    sel.value = cur;
    renderCriteria();
  }

  function renderCriteria() {
    var college = $('crit-college').value;
    var q = ($('crit-search').value || '').trim();
    var rows = (state.critDepts || []).filter(function (d) {
      if (college && d.college !== college) return false;
      if (q && d.name.indexOf(q) === -1) return false;
      return true;
    });
    var tbody = $('crit-list');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">해당 학과가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (d) {
      var span = d.year_from != null ? d.year_from + ' ~ ' + d.year_to + '학번' : '—';
      var status = d.status && d.status !== '운영' ? ' <span class="muted">(' + escapeHtml(d.status) + ')</span>' : '';
      var pdf = d.pdf_url
        ? '<a href="' + escapeHtml(d.pdf_url) + '" target="_blank" rel="noopener">PDF</a>'
        : '—';
      return '<tr>' +
        '<td><div class="row-title">' + escapeHtml(d.name) + status + '</div></td>' +
        '<td class="muted">' + escapeHtml(d.college || '—') + '</td>' +
        '<td class="muted">' + span + '</td>' +
        '<td class="muted">' + d.rows + '</td>' +
        '<td class="muted">' + pdf + '</td>' +
        '<td class="actions"><button type="button" class="btn btn-sm btn-secondary" data-act="view-crit" data-id="' +
        escapeHtml(d.name) + '">보기</button></td></tr>';
    }).join('');
  }

  function dash(v) { return v == null || v === '' ? '—' : escapeHtml(String(v)); }

  async function openCriteria(name) {
    var r = await api('/api/admin/graduation/criteria/' + encodeURIComponent(name));
    if (!r.ok) {
      toast(koreanAuthError(r.data, r.status), 'error');
      return;
    }
    state.critOpen = name;
    var d = (state.critDepts || []).filter(function (x) { return x.name === name; })[0] || {};
    $('crit-detail').style.display = '';
    $('crit-detail-title').textContent = name;
    $('crit-detail-meta').textContent = [d.college, d.phone ? '문의 ' + d.phone : null, '기준 ' + r.data.rows.length + '개']
      .filter(Boolean).join(' · ');
    $('crit-rows').innerHTML = r.data.rows.map(function (c) {
      var same = c.major_single && c.major_single === c.major_primary && c.major_single === c.major_double;
      var major = same ? c.major_single
        : [c.major_single ? '단수 ' + c.major_single : null, c.major_primary ? '주 ' + c.major_primary : null,
          c.major_double ? '복수 ' + c.major_double : null].filter(Boolean).join(' · ');
      var general = [c.personality_self || c.personality, c.communication, c.liberal_foreign, c.digital, c.academic_basic, c.convergence]
        .filter(function (v) { return v && v !== '-'; }).length;
      var lang = [c.lang_test, c.lang_requirement].filter(function (v) { return v && v !== '-'; }).join(' ');
      return '<tr>' +
        '<td style="white-space:nowrap">' + escapeHtml(c.student_type) + (c.program ? '<div class="muted">' + escapeHtml(c.program) + '</div>' : '') + '</td>' +
        '<td class="muted">' + escapeHtml(c.year_label || (c.year_from + '~' + c.year_to)) +
        (c.affiliation ? '<div class="muted">당시 ' + escapeHtml(c.affiliation) + '</div>' : '') + '</td>' +
        '<td>' + dash(c.total_credits) + '</td>' +
        '<td class="muted">' + (major || '—') + '</td>' +
        '<td class="muted">' + (general ? general + '개 영역' : '—') + '</td>' +
        '<td class="muted">' + dash(c.volunteer) + '</td>' +
        '<td class="muted">' + (lang ? escapeHtml(lang) : '—') + '</td>' +
        '<td class="muted">' + dash(c.thesis) + '</td></tr>';
    }).join('');
    var first = r.data.rows[0];
    if (first && !$('crit-prev-year').value) $('crit-prev-year').value = first.year_from;
    $('crit-preview').textContent = '학번과 학생구분을 고르고 「카톡 미리보기」를 누르세요.';
    $('crit-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function previewCriteria() {
    if (!state.critOpen) return;
    var year = $('crit-prev-year').value;
    var type = $('crit-prev-type').value;
    var r = await api('/api/admin/graduation/criteria/' + encodeURIComponent(state.critOpen) +
      '?year=' + encodeURIComponent(year) + '&type=' + encodeURIComponent(type));
    if (!r.ok) {
      toast(koreanAuthError(r.data, r.status), 'error');
      return;
    }
    $('crit-preview').textContent = r.data.preview || '학번을 입력해 주세요.';
  }

  /* ── 공식 PDF 올리기 → 미리보기 → 적용 / 되돌리기 ── */
  async function uploadPdfs(files) {
    files = Array.prototype.filter.call(files, function (f) { return /\.pdf$/i.test(f.name) || f.type === 'application/pdf'; });
    if (!files.length) {
      toast('PDF 파일만 올릴 수 있습니다.', 'error');
      return;
    }
    var batchId = state.impBatch && state.impBatch.status === 'preview' ? state.impBatch.id : null;
    for (var i = 0; i < files.length; i++) {
      $('imp-result').innerHTML = '<p class="muted">변환 중… (' + (i + 1) + ' / ' + files.length + ') ' + escapeHtml(files[i].name) + '</p>';
      var h = { 'Content-Type': 'application/pdf', 'x-file-name': encodeURIComponent(files[i].name) };
      if (state.token) h['x-admin-token'] = state.token;
      var res = await fetch('/api/admin/graduation/import' + (batchId ? '?batch=' + encodeURIComponent(batchId) : ''), {
        method: 'POST', headers: h, body: files[i],
      });
      var data = await res.json().catch(function () { return null; });
      if (!res.ok) {
        toast((data && data.error) || ('올리기 실패 (' + res.status + ')'), 'error');
        continue;
      }
      state.impBatch = data;
      batchId = data.id;
    }
    renderImport();
    loadImportHistory();
  }

  function diffSummary(d) {
    if (!d) return '';
    var parts = [];
    if (d.changed.length) parts.push('값 변경 ' + d.changed.length + '곳');
    if (d.added.length) parts.push('새 학번 구간 ' + d.added.length + '개');
    if (d.removed.length) parts.push('없어지는 학번 구간 ' + d.removed.length + '개');
    return parts.length ? parts.join(' · ') : '바뀌는 값 없음 (지금과 같음)';
  }

  function rowLabel(r) {
    var y = r.year_from === r.year_to ? r.year_from : r.year_from + '~' + r.year_to;
    return (r.program ? r.program + ' · ' : '') + y + '학번 · ' + r.student_type;
  }

  /** 적용 · 되돌림 · 취소 뒤 안내 — 적용했으면 그 자리에 되돌리기 버튼 (기록을 펼쳐 찾지 않아도 되게) */
  function statusLine(b, revertAct) {
    var msg = { applied: '적용됨 — 카톡 답변에 바로 반영되었습니다.', reverted: '되돌림 — 올리기 전 값으로 돌아갔습니다.', discarded: '취소됨 — 아무것도 바뀌지 않았습니다.' }[b.status] || b.status;
    var html = '<p class="imp-ok">' + escapeHtml(msg) + '</p>';
    if (b.status === 'applied') {
      html += '<div class="imp-actions"><button type="button" class="btn btn-secondary" data-act="' + revertAct + '" data-id="' + escapeHtml(b.id) +
        '">잘못 올렸다면 되돌리기</button></div>';
    }
    return html;
  }

  function renderImport() {
    var b = state.impBatch;
    if (!b) {
      $('imp-result').innerHTML = '';
      return;
    }
    var applicable = 0;
    var html = b.files.map(function (f) {
      var head = '<h3>' + escapeHtml(f.file) + (f.department ? ' → ' + escapeHtml(f.department) : '') + '</h3>';
      if (f.error) return '<div class="imp-file">' + head + '<p class="imp-warn">' + escapeHtml(f.error) + '</p></div>';
      applicable += 1;
      var d = f.diff;
      var out = head + '<p class="imp-ok">' + escapeHtml(diffSummary(d)) + (d && d.newDepartment ? ' · 새 학과' : '') + '</p>';
      out += (f.warnings || []).map(function (w) { return '<p class="imp-warn">⚠ ' + escapeHtml(w) + '</p>'; }).join('');
      var rows = [];
      (d ? d.changed : []).forEach(function (c) {
        c.fields.forEach(function (x) {
          rows.push('<tr><td>' + escapeHtml(c.label) + '</td><td>' + escapeHtml(x.label) + '</td><td class="before">' +
            escapeHtml(x.before == null ? '(없음)' : x.before) + '</td><td class="after">' + escapeHtml(x.after == null ? '(없음)' : x.after) + '</td></tr>');
        });
      });
      (d ? d.added : []).forEach(function (r) {
        rows.push('<tr><td>' + escapeHtml(rowLabel(r)) + '</td><td>새 구간</td><td class="before">—</td><td class="after">졸업학점 ' + escapeHtml(r.total_credits || '—') + '</td></tr>');
      });
      (d ? d.removed : []).forEach(function (r) {
        rows.push('<tr><td>' + escapeHtml(rowLabel(r)) + '</td><td>없어짐</td><td class="before">졸업학점 ' + escapeHtml(r.total_credits || '—') + '</td><td class="after">—</td></tr>');
      });
      if (rows.length) {
        out += '<div class="table-wrap"><table class="data"><thead><tr><th>학번 · 학생구분</th><th>항목</th><th>지금</th><th>PDF</th></tr></thead><tbody>' +
          rows.join('') + '</tbody></table></div>';
      }
      return '<div class="imp-file">' + out + '</div>';
    }).join('');
    if (b.status === 'preview') {
      html += '<div class="imp-actions">' +
        (applicable ? '<button type="button" class="btn" data-act="imp-apply" data-id="' + escapeHtml(b.id) + '">적용</button>' : '') +
        '<button type="button" class="btn btn-secondary" data-act="imp-discard" data-id="' + escapeHtml(b.id) + '">취소</button></div>';
    } else {
      html += statusLine(b, 'imp-revert');
    }
    $('imp-result').innerHTML = html;
  }

  async function importAction(action, id) {
    if (action === 'apply' && !window.confirm('카톡 답변이 바로 바뀝니다. 적용할까요?')) return;
    if (action === 'revert' && !window.confirm('적용 전 값으로 되돌릴까요?')) return;
    var r = await api('/api/admin/graduation/import/' + encodeURIComponent(id) + '/' + action, { method: 'POST' });
    if (!r.ok) {
      toast((r.data && r.data.error) || '실패', 'error');
      return;
    }
    var b = r.data.batch || r.data;
    if (state.impBatch && state.impBatch.id === b.id) state.impBatch = b;
    renderImport();
    toast({ apply: '적용했습니다', revert: '되돌렸습니다', discard: '취소했습니다' }[action], 'ok');
    loadImportHistory();
    state.critDepts = null;
    loadCriteria();
    if (state.critOpen && r.data.departments && r.data.departments.indexOf(state.critOpen) !== -1) openCriteria(state.critOpen);
  }

  async function loadImportHistory() {
    var r = await api('/api/admin/graduation/import');
    if (!r.ok) return;
    var list = (r.data && r.data.batches) || [];
    if (!list.length) {
      $('imp-history').innerHTML = '<p class="muted">아직 올린 기록이 없습니다.</p>';
      return;
    }
    var label = { preview: '미리보기', applied: '적용됨', reverted: '되돌림', discarded: '취소됨' };
    $('imp-history').innerHTML = '<table class="data"><tbody>' + list.map(function (b) {
      var depts = b.files.filter(function (f) { return f.department && !f.error; }).map(function (f) { return f.department; });
      var t = new Date(b.reverted_at || b.applied_at || b.created_at);
      var when = isNaN(t) ? '' : t.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return '<tr><td class="muted">' + escapeHtml(when) + '</td><td>' + escapeHtml(depts.join(', ') || '(학과 없음)') +
        '</td><td class="muted">' + escapeHtml(label[b.status] || b.status) + '</td><td class="actions">' +
        (b.status === 'applied' ? '<button type="button" class="btn btn-sm btn-secondary" data-act="imp-revert" data-id="' + escapeHtml(b.id) + '">되돌리기</button>' : '') +
        '</td></tr>';
    }).join('') + '</tbody></table>';
  }

  async function downloadAuthed(url, fallbackName) {
    var h = {};
    if (state.token) h['x-admin-token'] = state.token;
    var res = await fetch(url, { headers: h });
    if (!res.ok) {
      var e = await res.json().catch(function () { return null; });
      toast((e && e.error) || '내려받기 실패', 'error');
      return;
    }
    var cd = res.headers.get('Content-Disposition') || '';
    var m = cd.match(/filename\*=UTF-8''([^;]+)/);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob());
    a.download = m ? decodeURIComponent(m[1]) : fallbackName;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
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
          '">휴지통으로</button>' +
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
    ['c_name', 'c_category', 'c_contact', 'c_meeting', 'c_location', 'c_source', 'c_summary', 'c_intro', 'c_activities'].forEach(
      function (id) {
        $(id).value = '';
      }
    );
    $('club-form-title').textContent = '동아리 추가';
    $('btn-club-reset').textContent = '칸 비우기';
    checkClubDup();
  }

  /** 추가 칸에 이미 있는 이름을 적으면 새로 만들지 말고 고치라고 안내 (같은 동아리가 두 개 생기지 않게) */
  function normName(n) {
    return String(n || '').replace(/\s+/g, '').toLowerCase();
  }
  function checkClubDup() {
    var box = $('c_dup');
    var name = normName($('c_name').value);
    var editing = $('c_editId').value;
    var same = name && state.clubs.find(function (c) { return normName(c.name) === name && c.id !== editing; });
    if (!same) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    box.style.display = '';
    var last = same.name.charCodeAt(same.name.length - 1) - 0xac00;
    var josa = last >= 0 && last <= 11171 && last % 28 !== 0 ? '은' : '는';
    box.innerHTML = '「' + escapeHtml(same.name) + '」' + josa + ' 이미 있습니다. 새로 만들지 말고 ' +
      '<button type="button" class="btn btn-sm btn-secondary" data-act="edit-club" data-id="' + escapeHtml(same.id) + '">이 동아리 고치기</button>';
  }

  function fillClub(c) {
    $('c_editId').value = c.id;
    $('c_name').value = c.name || '';
    $('c_category').value = c.category || '';
    $('c_contact').value = c.contact || '';
    $('c_meeting').value = c.meeting_time || '';
    $('c_location').value = c.location || '';
    $('c_source').value = c.source_url || '';
    $('c_summary').value = c.summary || '';
    $('c_intro').value = c.intro || '';
    $('c_activities').value = c.activities || '';
    $('club-form-title').textContent = '동아리 수정 — ' + (c.name || '');
    $('btn-club-reset').textContent = '수정 취소';
    checkClubDup();
    showPage('clubs');
    $('club-form-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderClubList() {
    var tbody = $('c_list');
    if (!state.clubs.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">등록된 동아리가 없습니다.</td></tr>';
      return;
    }
    var q = normName($('c_search').value);
    var shown = q ? state.clubs.filter(function (c) { return normName(c.name + c.category).indexOf(q) !== -1; }) : state.clubs;
    $('c_count').textContent = q ? '· ' + shown.length + ' / ' + state.clubs.length + '곳' : '· ' + state.clubs.length + '곳';
    if (!shown.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">「' + escapeHtml($('c_search').value) + '」에 맞는 동아리가 없습니다. 새 동아리라면 아래에서 추가하세요.</td></tr>';
      return;
    }
    tbody.innerHTML = shown
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
      summary: $('c_summary').value.trim(),
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
    toast(id ? '동아리를 고쳤습니다 — 다음 질문부터 반영' : '동아리를 추가했습니다 — 다음 질문부터 반영', 'ok');
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

  /* ── 미답변 (FR-12): 같은 질문 묶음 · 처리 상태 · 키워드 사전으로 보완 ── */
  var U_STATUS_LABEL = { new: '새 질문', resolved: '해결', ignored: '무시' };

  function shortTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return String(iso || '');
    return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function renderUnanswered() {
    var tbody = $('u_list');
    var c = state.uCounts || {};
    ['new', 'resolved', 'ignored'].forEach(function (k) {
      $('u-cnt-' + k).textContent = c[k] ? String(c[k]) : '';
    });
    document.querySelectorAll('#u-tabs .seg-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-ustatus') === state.uStatus);
    });
    var groups = state.unanswered || [];
    if (!groups.length) {
      var empty = { new: '새로 쌓인 미답변 질문이 없습니다.', resolved: '해결한 질문이 없습니다.', ignored: '무시한 질문이 없습니다.' };
      tbody.innerHTML = '<tr><td colspan="5" class="empty">' + empty[state.uStatus] + '</td></tr>';
      return;
    }
    tbody.innerHTML = groups
      .map(function (g) {
        var key = escapeHtml(g.key);
        var acts = [];
        if (g.status === 'new') {
          // '기타'는 '주짓수 배우고 싶어'처럼 '동아리'라는 말 없이 물은 동아리 질문일 수 있다 — 아니면 「무시」
          if (g.area === '동아리') {
            acts.push('<button type="button" class="btn btn-sm" data-act="u-dict" data-id="' + key + '">사전에 추가</button>');
          } else if (g.area === '기타') {
            acts.push('<button type="button" class="btn btn-sm btn-secondary" data-act="u-dict" data-id="' + key +
              '" title="학식 · 기숙사처럼 챗봇이 다루지 않는 질문이면 「무시」를 누르세요">동아리 질문이면 사전에</button>');
          }
          acts.push('<button type="button" class="btn btn-sm btn-secondary" data-act="u-resolved" data-id="' + key + '">해결</button>');
          acts.push('<button type="button" class="btn btn-sm btn-ghost" data-act="u-ignored" data-id="' + key + '">무시</button>');
        } else {
          acts.push('<button type="button" class="btn btn-sm btn-ghost" data-act="u-new" data-id="' + key + '">새 질문으로</button>');
        }
        return (
          '<tr><td><span class="row-title">' + escapeHtml(g.question) + '</span>' +
          (g.count > 1 ? ' <span class="badge badge-ph">' + g.count + '번</span>' : '') +
          '</td><td class="muted" style="white-space:nowrap">' + escapeHtml(g.area) +
          '</td><td class="muted">' + escapeHtml(g.reason) +
          '</td><td class="muted" style="white-space:nowrap">' + escapeHtml(shortTime(g.last_at)) +
          '</td><td class="actions">' + acts.join(' ') + '</td></tr>'
        );
      })
      .join('');
  }

  async function loadUnanswered() {
    state.uStatus = state.uStatus || 'new';
    var r = await api('/api/unanswered?status=' + state.uStatus);
    if (!r.ok) {
      if (r.status === 401) {
        lock();
        showLogin(koreanAuthError(r.data, r.status));
        return;
      }
      toast(koreanAuthError(r.data, r.status) || '미답변 로드 실패', 'error');
      return;
    }
    state.unanswered = (r.data && r.data.groups) || [];
    state.uCounts = (r.data && r.data.counts) || {};
    renderUnanswered();
    updateStats();
  }

  function findGroup(key) {
    return (state.unanswered || []).filter(function (g) { return g.key === key; })[0];
  }

  async function setGroupStatus(key, status, quiet) {
    var g = findGroup(key);
    if (!g) return;
    var r = await api('/api/unanswered/status', { method: 'POST', body: { ids: g.ids, status: status } });
    if (!r.ok) {
      toast((r.data && r.data.error) || '처리 실패', 'error');
      return;
    }
    if (!quiet) toast('「' + g.question + '」 → ' + U_STATUS_LABEL[status], 'ok');
    loadUnanswered();
  }

  async function clearHandled() {
    if (!window.confirm('해결 · 무시로 처리한 기록을 지웁니다. 새 질문은 남습니다. 계속할까요?')) return;
    var r = await api('/api/unanswered?handled=1', { method: 'DELETE' });
    if (!r.ok) {
      toast('비우기 실패', 'error');
      return;
    }
    toast('처리한 기록 ' + r.data.deleted + '건을 지웠습니다', 'ok');
    loadUnanswered();
  }

  /** 질문에서 사전에 넣을 만한 말만 남긴다 ("총 쏘는 동아리 없나?" → "총, 쏘는") */
  var KW_STOP = /^(동아리|동아리는|동아리가|클럽|모임|있어|있나|있나요|있어요|없나|없나요|없어|뭐|뭐가|뭐야|어디|어떤|무슨|하는|할|하고|싶어|싶은|싶다|알려줘|추천|추천해줘|좀|우리|학교|동국대|wise)$/i;
  function suggestWords(q) {
    return q.replace(/[?？!.,~]/g, ' ').split(/\s+/)
      .filter(function (w) { return w && !KW_STOP.test(w); })
      .map(function (w) { return w.length > 2 ? w.replace(/(은|는|이|가|을|를|에서|에|도)$/, '') : w; })
      .filter(function (w) { return w && !KW_STOP.test(w); });
  }

  function dictFromUnanswered(key) {
    var g = findGroup(key);
    if (!g) return;
    resetKeyword();
    state.kwResolve = { ids: g.ids, question: g.question };
    $('kw_words').value = suggestWords(g.question).join(', ');
    var from = $('kw-from');
    from.style.display = '';
    from.textContent = '미답변 「' + g.question + '」에서 왔습니다. 학생 표현을 다듬고 분야를 적어 저장하면 이 질문을 「해결」로 표시합니다.';
    showPage('clubs');
    $('kw-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('kw_field').focus();
  }

  /* ── 동아리 엑셀 올리기: 미리보기 → 적용 → 되돌리기 ── */
  async function uploadClubXlsx(file) {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      toast('엑셀(.xlsx) 파일만 올릴 수 있습니다.', 'error');
      return;
    }
    $('cimp-result').innerHTML = '<p class="muted">읽는 중… ' + escapeHtml(file.name) + '</p>';
    var h = { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'x-file-name': encodeURIComponent(file.name) };
    if (state.token) h['x-admin-token'] = state.token;
    var res = await fetch('/api/admin/clubs/import', { method: 'POST', headers: h, body: file });
    var data = await res.json().catch(function () { return null; });
    if (!res.ok) {
      $('cimp-result').innerHTML = '<p class="imp-warn">' + escapeHtml((data && data.error) || '올리기 실패') + '</p>';
      return;
    }
    state.clubImport = data;
    renderClubImport();
    loadClubImportHistory();
  }

  function renderClubImport() {
    var b = state.clubImport;
    if (!b) {
      $('cimp-result').innerHTML = '';
      return;
    }
    var d = b.diff;
    var parts = [];
    if (d.changed.length) parts.push('값 변경 ' + d.changed.length + '곳');
    if (d.added.length) parts.push('새 동아리 ' + d.added.length + '곳');
    if (d.errors.length) parts.push('거부 ' + d.errors.length + '줄');
    var html = '<div class="imp-file"><h3>' + escapeHtml(b.file) + '</h3><p class="imp-ok">' +
      escapeHtml(parts.length ? parts.join(' · ') : '바뀌는 값 없음 (지금과 같음)') + ' · 같음 ' + d.same + '곳</p>';
    d.errors.forEach(function (e) {
      html += '<p class="imp-warn">⚠ ' + e.row + '번째 줄 ' + escapeHtml(e.name) + ': ' + escapeHtml(e.message) + ' — 이 줄은 반영하지 않습니다</p>';
    });
    d.warnings.forEach(function (e) {
      html += '<p class="imp-ok">· ' + escapeHtml(e.name) + ': ' + escapeHtml(e.message) + '</p>';
    });
    var rows = [];
    d.changed.forEach(function (c) {
      c.fields.forEach(function (f) {
        rows.push('<tr><td>' + escapeHtml(c.name) + '</td><td>' + escapeHtml(f.label) + '</td><td class="before">' +
          escapeHtml(f.before || '(빈칸)') + '</td><td class="after">' + escapeHtml(f.after || '(빈칸)') + '</td></tr>');
      });
    });
    d.added.forEach(function (a) {
      rows.push('<tr><td>' + escapeHtml(a.name) + '</td><td>새 동아리</td><td class="before">—</td><td class="after">추가</td></tr>');
    });
    if (rows.length) {
      html += '<div class="table-wrap"><table class="data"><thead><tr><th>동아리</th><th>항목</th><th>지금</th><th>엑셀</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
    }
    if (d.missing.length) {
      html += '<p class="imp-ok">엑셀에 없는 동아리 ' + d.missing.length + '곳은 그대로 둡니다: ' + escapeHtml(d.missing.slice(0, 8).join(', ')) + (d.missing.length > 8 ? ' …' : '') + '</p>';
    }
    html += '</div>';
    if (b.status === 'preview') {
      html += '<div class="imp-actions">' +
        (d.changed.length || d.added.length ? '<button type="button" class="btn" data-act="cimp-apply" data-id="' + escapeHtml(b.id) + '">적용</button>' : '') +
        '<button type="button" class="btn btn-secondary" data-act="cimp-discard" data-id="' + escapeHtml(b.id) + '">취소</button></div>';
    } else {
      html += statusLine(b, 'cimp-revert');
    }
    $('cimp-result').innerHTML = html;
  }

  async function clubImportAction(action, id) {
    if (action === 'apply' && !window.confirm('카톡 답변이 바로 바뀝니다. 적용할까요?')) return;
    if (action === 'revert' && !window.confirm('이 엑셀을 올리기 전 값으로 되돌릴까요? 이 엑셀로 추가한 동아리는 삭제됩니다.')) return;
    var r = await api('/api/admin/clubs/import/' + encodeURIComponent(id) + '/' + action, { method: 'POST' });
    if (!r.ok) {
      toast((r.data && r.data.error) || '실패', 'error');
      return;
    }
    var b = r.data.batch;
    if (state.clubImport && state.clubImport.id === b.id) state.clubImport = b;
    renderClubImport();
    toast({ apply: '적용했습니다 (추가 ' + (r.data.added || 0) + ' · 변경 ' + (r.data.changed || 0) + ')', revert: '되돌렸습니다', discard: '취소했습니다' }[action], 'ok');
    loadClubImportHistory();
    loadClubs();
  }

  async function loadClubImportHistory() {
    var r = await api('/api/admin/clubs/import');
    if (!r.ok) return;
    var list = (r.data && r.data.batches) || [];
    if (!list.length) {
      $('cimp-history').innerHTML = '<p class="muted">아직 올린 기록이 없습니다.</p>';
      return;
    }
    var label = { preview: '미리보기', applied: '적용됨', reverted: '되돌림', discarded: '취소됨' };
    $('cimp-history').innerHTML = '<table class="data"><tbody>' + list.map(function (b) {
      var t = new Date(b.reverted_at || b.applied_at || b.created_at);
      var when = isNaN(t) ? '' : t.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return '<tr><td class="muted">' + escapeHtml(when) + '</td><td>' + escapeHtml(b.file) + '</td><td class="muted">변경 ' + b.diff.changed.length +
        ' · 추가 ' + b.diff.added.length + '</td><td class="muted">' + escapeHtml(label[b.status] || b.status) + '</td><td class="actions">' +
        (b.status === 'applied' ? '<button type="button" class="btn btn-sm btn-secondary" data-act="cimp-revert" data-id="' + escapeHtml(b.id) + '">되돌리기</button>' : '') +
        '</td></tr>';
    }).join('') + '</tbody></table>';
  }

  /* ── 키워드 사전 ── */
  async function loadKeywords() {
    var r = await api('/api/admin/clubs/keywords');
    if (!r.ok) {
      toast((r.data && r.data.error) || '사전 로드 실패', 'error');
      return;
    }
    state.keywords = (r.data && r.data.entries) || [];
    renderKeywords();
  }

  function renderKeywords() {
    var list = state.keywords || [];
    $('kw-summary').textContent = '· ' + list.length + '개 항목';
    if (!list.length) {
      $('kw_list').innerHTML = '<tr><td colspan="4" class="empty">사전 항목이 없습니다.</td></tr>';
      return;
    }
    $('kw_list').innerHTML = list
      .map(function (e) {
        var words = e.simple ? e.words.join(', ') : e.q;
        var field = e.simple ? (e.c ? e.fieldWords.join(', ') : '(왼쪽과 같음)') : (e.c || '(왼쪽과 같음)');
        var clubs = e.clubs.length ? e.clubs.join(', ') : '<span class="imp-warn">연결되는 동아리 없음</span>';
        var acts = (e.simple ? '<button type="button" class="btn btn-sm btn-secondary" data-act="kw-edit" data-id="' + e.index + '">수정</button> ' : '<span class="badge badge-ph" title="예외 규칙이 들어 있어 화면에서 고칠 수 없습니다">고급</span> ') +
          '<button type="button" class="btn btn-sm btn-danger" data-act="kw-del" data-id="' + e.index + '">삭제</button>';
        return '<tr><td>' + escapeHtml(words) + '</td><td class="muted">' + escapeHtml(field) + '</td><td class="muted">' +
          (e.clubs.length ? escapeHtml(e.clubs.join(', ')) : clubs) + '</td><td class="actions">' + acts + '</td></tr>';
      })
      .join('');
  }

  function resetKeyword() {
    $('kw_index').value = '';
    $('kw_q').value = '';
    $('kw_words').value = '';
    $('kw_field').value = '';
    $('kw-preview').textContent = '';
    $('kw-from').style.display = 'none';
    $('btn-kw-save').textContent = '사전에 저장';
    state.kwResolve = null;
  }

  function editKeyword(index) {
    var e = (state.keywords || [])[Number(index)];
    if (!e) return;
    resetKeyword();
    $('kw_index').value = String(e.index);
    $('kw_q').value = e.q;
    $('kw_words').value = e.words.join(', ');
    $('kw_field').value = e.c ? e.fieldWords.join(', ') : '';
    $('btn-kw-save').textContent = '수정 저장';
    $('kw-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function previewKeyword() {
    var r = await api('/api/admin/clubs/keywords/preview', { method: 'POST', body: { words: $('kw_words').value, field: $('kw_field').value } });
    if (!r.ok) {
      $('kw-preview').textContent = (r.data && r.data.error) || '미리보기 실패';
      return null;
    }
    var clubs = r.data.clubs || [];
    $('kw-preview').textContent = clubs.length
      ? '연결되는 동아리: ' + clubs.join(', ')
      : '연결되는 동아리가 없습니다 — 분야 칸에 동아리 소개에 실제로 적힌 말(예: 천체, 검도)을 넣어 주세요.';
    return clubs;
  }

  async function saveKeyword() {
    var clubs = await previewKeyword();
    if (clubs === null) return;
    if (!clubs.length && !window.confirm('연결되는 동아리가 없습니다. 그래도 저장할까요?')) return;
    var idx = $('kw_index').value;
    var body = { words: $('kw_words').value, field: $('kw_field').value, q: $('kw_q').value };
    var r = idx
      ? await api('/api/admin/clubs/keywords/' + idx, { method: 'PUT', body: body })
      : await api('/api/admin/clubs/keywords', { method: 'POST', body: body });
    if (!r.ok) {
      toast((r.data && r.data.error) || '저장 실패', 'error');
      return;
    }
    state.keywords = r.data.entries || [];
    renderKeywords();
    var resolve = state.kwResolve;
    resetKeyword();
    toast(idx ? '사전을 고쳤습니다' : '사전에 추가했습니다 — 다음 질문부터 적용', 'ok');
    if (resolve) {
      await api('/api/unanswered/status', { method: 'POST', body: { ids: resolve.ids, status: 'resolved' } });
      toast('「' + resolve.question + '」를 해결로 표시했습니다', 'ok');
    }
  }

  async function deleteKeyword(index) {
    var e = (state.keywords || [])[Number(index)];
    if (!e) return;
    if (!window.confirm('「' + (e.simple ? e.words.join(', ') : e.q) + '」 항목을 사전에서 지울까요?')) return;
    var r = await api('/api/admin/clubs/keywords/' + e.index + '?q=' + encodeURIComponent(e.q), { method: 'DELETE' });
    if (!r.ok) {
      toast((r.data && r.data.error) || '삭제 실패', 'error');
      return;
    }
    state.keywords = r.data.entries || [];
    renderKeywords();
    toast('사전에서 지웠습니다', 'ok');
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
      tbody.innerHTML = '<tr><td colspan="5" class="empty">' + (state.noticeTab === 'trash' ? '휴지통이 비어 있습니다.' : '등록된 공지가 없습니다.') + '</td></tr>';
      $('n-cnt-trash').textContent = state.noticeTrashCount ? String(state.noticeTrashCount) : '';
      return;
    }
    var trash = state.noticeTab === 'trash';
    document.querySelectorAll('#n-tabs .seg-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-ntab') === (trash ? 'trash' : 'live'));
    });
    $('n-cnt-trash').textContent = state.noticeTrashCount ? String(state.noticeTrashCount) : '';
    $('n-th-period').textContent = trash ? '휴지통 이동' : '게시 기간';
    $('n-th-extra').textContent = trash ? '자동 삭제' : '알림 전달';
    tbody.innerHTML = state.notices
      .map(function (n) {
        if (trash) {
          return (
            '<tr><td><div class="row-title">' + escapeHtml(n.title) + '</div><div class="muted">' +
            escapeHtml(String(n.body).slice(0, 60)) + '</div></td>' +
            '<td class="muted">휴지통</td>' +
            '<td class="muted">' + escapeHtml(String(n.trashed_at || '').slice(0, 10)) + ' 이동</td>' +
            '<td class="muted" style="white-space:nowrap">' + escapeHtml(String(n.days_left)) + '일 뒤 자동 삭제</td>' +
            '<td class="actions"><button type="button" class="btn btn-sm btn-secondary" data-act="restore-notice" data-id="' + escapeHtml(n.id) +
            '">복원</button> <button type="button" class="btn btn-sm btn-danger" data-act="purge-notice" data-id="' + escapeHtml(n.id) +
            '">완전히 삭제</button></td></tr>'
          );
        }
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
          '<button type="button" class="btn btn-sm btn-ghost" data-act="del-notice" data-id="' +
          escapeHtml(n.id) +
          '">휴지통으로</button>' +
          '</td></tr>'
        );
      })
      .join('');
  }

  async function loadNotices() {
    var r = await api('/api/admin/notices' + (state.noticeTab === 'trash' ? '?trash=1' : ''));
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
    state.noticeTrashCount = (r.data && r.data.trash_count) || 0;
    if (state.noticeTab !== 'trash') state.noticeLiveCount = state.notices.length;
    if (r.data && r.data.sweep && r.data.sweep.trashed) toast('기간이 끝난 공지 ' + r.data.sweep.trashed + '건을 휴지통으로 옮겼습니다', 'ok');
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
    if (!window.confirm('이 공지를 휴지통으로 옮길까요? 30일 안에는 복원할 수 있습니다.')) return;
    var r = await api('/api/admin/notices/' + id, { method: 'DELETE' });
    if (!r.ok) {
      toast((r.data && r.data.error) || '삭제 실패', 'error');
      return;
    }
    toast('휴지통으로 옮겼습니다', 'ok');
    loadNotices();
  }

  async function restoreNoticeUi(id) {
    var r = await api('/api/admin/notices/' + id + '/restore', { method: 'POST' });
    if (!r.ok) {
      toast((r.data && r.data.error) || '복원 실패', 'error');
      return;
    }
    // 복원한 공지를 바로 고칠 수 있게: 게시 목록으로 돌아가 수정 칸에 연다 (기간 지난 공지는 종료일만 새로 정하면 다시 게시)
    state.noticeTab = 'live';
    await loadNotices();
    var n = r.data.notice;
    if (n && r.data.asDraft) {
      fillNotice(n);
      $('n_published').checked = true;
      $('n_ends').focus();
      toast('복원했습니다 — 아래 수정 칸에서 게시 종료일을 새로 정하고 저장하면 다시 게시됩니다.', 'ok');
    } else {
      toast('복원했습니다 — 게시 목록으로 돌아갔습니다.', 'ok');
    }
  }

  async function purgeNotice(id) {
    if (!window.confirm('휴지통에서 완전히 삭제합니다. 되돌릴 수 없습니다. 계속할까요?')) return;
    var r = await api('/api/admin/notices/' + id + '?purge=1', { method: 'DELETE' });
    if (!r.ok) {
      toast((r.data && r.data.error) || '삭제 실패', 'error');
      return;
    }
    toast('완전히 삭제했습니다', 'ok');
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
    $('btn-crit-reload').addEventListener('click', loadCriteria);
    $('crit-college').addEventListener('change', renderCriteria);
    $('crit-search').addEventListener('input', renderCriteria);
    $('btn-crit-close').addEventListener('click', function () { $('crit-detail').style.display = 'none'; state.critOpen = null; });
    $('btn-crit-preview').addEventListener('click', previewCriteria);
    $('imp-file').addEventListener('change', function (e) { uploadPdfs(e.target.files); e.target.value = ''; });
    var dz = $('imp-drop');
    ['dragenter', 'dragover'].forEach(function (t) { dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (t) { dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.remove('drag'); }); });
    dz.addEventListener('drop', function (e) { uploadPdfs(e.dataTransfer.files); });
    $('btn-crit-xlsx').addEventListener('click', function () { downloadAuthed('/api/admin/graduation/criteria.xlsx', '공식졸업기준.xlsx'); });
    $('btn-crit-md').addEventListener('click', function () {
      if (state.critOpen) downloadAuthed('/api/admin/graduation/criteria/' + encodeURIComponent(state.critOpen) + '/md', state.critOpen + '.md');
    });
    $('filter-year').addEventListener('change', renderGradList);
    $('filter-dept').addEventListener('input', renderGradList);

    $('btn-club-save').addEventListener('click', saveClub);
    $('btn-club-reset').addEventListener('click', resetClubForm);
    $('c_search').addEventListener('input', renderClubList);
    $('c_name').addEventListener('input', checkClubDup);
    $('btn-club-reload').addEventListener('click', loadClubs);
    $('btn-reindex').addEventListener('click', reindexAll);

    $('btn-unanswered-reload').addEventListener('click', loadUnanswered);
    $('btn-unanswered-clear').addEventListener('click', clearHandled);
    document.querySelectorAll('#u-tabs .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.uStatus = b.getAttribute('data-ustatus');
        loadUnanswered();
      });
    });
    $('btn-kw-reload').addEventListener('click', loadKeywords);
    $('btn-club-xlsx').addEventListener('click', function () { downloadAuthed('/api/admin/clubs.xlsx', '동아리.xlsx'); });
    $('cimp-file').addEventListener('change', function (e) { uploadClubXlsx(e.target.files[0]); e.target.value = ''; });
    var cdz = $('cimp-drop');
    ['dragenter', 'dragover'].forEach(function (t) { cdz.addEventListener(t, function (e) { e.preventDefault(); cdz.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (t) { cdz.addEventListener(t, function (e) { e.preventDefault(); cdz.classList.remove('drag'); }); });
    cdz.addEventListener('drop', function (e) { uploadClubXlsx(e.dataTransfer.files[0]); });
    $('btn-kw-save').addEventListener('click', saveKeyword);
    $('btn-kw-preview').addEventListener('click', previewKeyword);
    $('btn-kw-reset').addEventListener('click', resetKeyword);

    $('btn-notice-save').addEventListener('click', saveNotice);
    $('btn-notice-reset').addEventListener('click', resetNoticeForm);
    $('btn-notice-reload').addEventListener('click', loadNotices);
    document.querySelectorAll('#n-tabs .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.noticeTab = b.getAttribute('data-ntab');
        loadNotices();
      });
    });
    $('btn-notice-preview').addEventListener('click', previewNotices);

    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var act = t.getAttribute('data-act');
      var id = t.getAttribute('data-id');
      if (!act || !id) return;
      if (act === 'cimp-apply' || act === 'cimp-discard' || act === 'cimp-revert') {
        clubImportAction(act.slice(5), id);
      } else if (act === 'u-resolved' || act === 'u-ignored' || act === 'u-new') {
        setGroupStatus(id, act.slice(2));
      } else if (act === 'u-dict') {
        dictFromUnanswered(id);
      } else if (act === 'kw-edit') {
        editKeyword(id);
      } else if (act === 'kw-del') {
        deleteKeyword(id);
      } else if (act === 'imp-apply' || act === 'imp-discard' || act === 'imp-revert') {
        importAction(act.slice(4), id);
      } else if (act === 'view-crit') {
        openCriteria(id);
      } else if (act === 'edit-grad') {
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
      } else if (act === 'restore-notice') {
        restoreNoticeUi(id);
      } else if (act === 'purge-notice') {
        purgeNotice(id);
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
