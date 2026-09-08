/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   COCKPIT BEHAVIOUR — one copy, linked by every demo page.

   Companion to ck.css. The missile-cover state machine here is ported from the real cockpit's shim
   (cockpit/handspike-cockpit.html) rather than reinvented, because the two-step is the single most
   important thing these pages demonstrate and a plausible-looking imitation of it would be worse
   than no demo at all.

   Every initialiser is defensive: a page that carries no guards, no tables, or no view switcher
   simply gets nothing wired. That is what lets three quite different pages share one file.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */
(function(){
  "use strict";

  function all(sel, root){ return [].slice.call((root || document).querySelectorAll(sel)); }

  /* ---- view switching -------------------------------------------------------------------------
     The sidebar drives which section is mounted, exactly as the real cockpit does. The breadcrumb
     and the page title FOLLOW the nav rather than being set independently, so they cannot drift
     apart from what is actually on screen. */
  function initViews(){
    var views = all('.ck-view');
    var navs  = all('.ck-nav button[data-view]');
    if(!views.length || !navs.length) return;
    var crumb = document.getElementById('crumb');
    var title = document.getElementById('viewTitle');

    navs.forEach(function(btn){
      btn.addEventListener('click', function(){
        var want = btn.getAttribute('data-view');
        navs.forEach(function(b){ b.classList.toggle('on', b === btn); });
        views.forEach(function(v){ v.hidden = v.getAttribute('data-view') !== want; });
        var label = (btn.getAttribute('data-label') || btn.textContent).trim();
        if(crumb) crumb.textContent = label;
        if(title) title.textContent = label;
      });
    });
  }

  /* ---- metric drill-downs ---------------------------------------------------------------------
     Every metric tile in the real cockpit opens to show its derivation. aria-expanded carries the
     state so the control is honest to a screen reader, not only to the eye. */
  function initDrills(){
    all('button.ck-card.drill').forEach(function(card){
      var panel = card.querySelector('.ck-drill');
      if(!panel) return;
      card.addEventListener('click', function(){
        var open = panel.hidden;
        panel.hidden = !open;
        card.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  }

  /* ---- expandable table rows ------------------------------------------------------------------ */
  function initRows(){
    all('.ck-tbl tr.row').forEach(function(row){
      var detail = row.nextElementSibling;
      if(!detail || !detail.classList.contains('detail')) return;
      function toggle(){
        var open = detail.hidden;
        detail.hidden = !open;
        row.classList.toggle('open', open);
      }
      row.addEventListener('click', function(e){
        // The Sell control is its own affordance; it must not double as a row expander.
        if(e.target.closest('.ck-sell')) return;
        toggle();
      });
      row.addEventListener('keydown', function(e){
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggle(); }
      });
    });
  }

  /* ---- memory notes --------------------------------------------------------------------------- */
  function initNotes(){
    all('.ck-note-head').forEach(function(head){
      var body = head.nextElementSibling;
      if(!body || !body.classList.contains('ck-note-body')) return;
      head.setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
      head.addEventListener('click', function(){
        var open = body.hidden;
        body.hidden = !open;
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  }

  /* ---- tag filters ----------------------------------------------------------------------------
     A chip row with [data-filter] values, filtering any sibling-scoped element carrying [data-tags].
     "all" is the reset. Filtering HIDES rather than reorders, so an operator who has learned where
     something sits on the page does not have to re-find it. */
  function initFilters(){
    var chips = all('[data-filter]');
    if(!chips.length) return;
    var targets = all('[data-tags]');
    var count = document.getElementById('filterCount');

    function apply(want){
      var shown = 0;
      targets.forEach(function(t){
        var hit = want === 'all' || (' ' + t.getAttribute('data-tags') + ' ').indexOf(' ' + want + ' ') > -1;
        t.hidden = !hit;
        if(hit) shown++;
      });
      if(count) count.textContent = shown + (shown === 1 ? ' entry' : ' entries');
    }

    chips.forEach(function(chip){
      chip.addEventListener('click', function(){
        chips.forEach(function(c){ c.classList.toggle('on', c === chip); });
        apply(chip.getAttribute('data-filter'));
      });
    });
    apply('all');
  }

  /* ---- missile covers -------------------------------------------------------------------------
     TWO-STEP, ported from the real shim: tap the cover to slide it off, THEN tap the switch behind
     to actually flip it. Cover-open and switch-state are deliberately independent — lifting a cover
     is consent to be ASKED, not consent to arm. */
  function initGuards(){
    var guards = all('.guard');
    if(!guards.length) return;
    var counter = document.getElementById('coverCount');

    function refreshCount(){
      if(!counter) return;
      var live = guards.filter(function(g){
        return g.classList.contains('armed') || g.classList.contains('on');
      }).length;
      counter.textContent = live === 0
        ? guards.length + ' covered'
        : live + ' live / ' + (guards.length - live) + ' covered';
      counter.className = 'v' + (live ? ' real-c' : '');
    }

    guards.forEach(function(guard){
      var cover = guard.querySelector('.cover-switch');
      if(!cover) return;
      var isKill  = guard.getAttribute('data-control') === 'kill';
      var onClass = isKill ? 'on' : 'armed';        // kill ENGAGES red; the others ARM orange
      var stateOn = isKill ? 'engaged' : 'armed';
      var track = guard.querySelector('.switch-track');
      var st    = guard.querySelector('.g-state');
      var flag  = guard.querySelector('.g-flag');

      function flipSwitch(){
        var on = !guard.classList.contains(onClass);
        guard.classList.toggle(onClass, on);
        if(st){
          st.classList.remove('off','armed','engaged');
          st.classList.add(on ? stateOn : 'off');
          var alt = st.getAttribute('data-alt');     // swap the label with its opposite state
          if(alt !== null){ st.setAttribute('data-alt', st.textContent.trim()); st.textContent = alt; }
        }
        if(flag) flag.textContent = on ? (isKill ? 'engaged' : 'armed') : 'open';
        // A switch turned OFF lets its cover fall shut again. An ACTIVE switch keeps its cover open:
        // nothing dangerous is allowed to hide under a closed lid.
        if(!on) setTimeout(function(){
          if(!guard.classList.contains(onClass)){
            guard.classList.remove('open');
            if(flag) flag.textContent = 'covered';
          }
        }, 220);
        refreshCount();
      }

      cover.addEventListener('click', function(e){
        if(!guard.classList.contains('open')){
          guard.classList.add('open');               // STEP 1: lift the cover, switch unchanged
          if(flag) flag.textContent = 'open';
          return;
        }
        if(track && e.target.closest('.switch-track')){
          flipSwitch();                              // STEP 2: tap the exposed switch to flip it
        } else if(!guard.classList.contains(onClass)){
          guard.classList.remove('open');            // re-cover only while the switch is OFF
          if(flag) flag.textContent = 'covered';
        }
      });

      var lid = guard.querySelector('.cover-lid');   // keyboard: Enter lifts, Enter again flips
      if(lid) lid.addEventListener('keydown', function(e){
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          if(!guard.classList.contains('open')){
            guard.classList.add('open');
            if(flag) flag.textContent = 'open';
          } else { flipSwitch(); }
        }
      });
    });

    refreshCount();
  }

  function boot(){ initViews(); initDrills(); initRows(); initNotes(); initFilters(); initGuards(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
