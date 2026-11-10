// iKobi — comportements partagés (aucune dépendance, aucun traceur).
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // En-tête : bordure au défilement + menu mobile
  const top = document.querySelector('.top');
  if (top) {
    const onScroll = () => top.classList.toggle('scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  const btn = document.querySelector('.menu-btn');
  const nav = document.getElementById('nav');
  if (btn && nav) {
    btn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Fermer' : 'Menu';
    });
  }

  // Cercle de la likelemba : la cagnotte passe d'un membre à l'autre, tour après tour.
  const circle = document.getElementById('circle');
  if (circle && !reduce) {
    const members = [...circle.querySelectorAll('.member')];
    const caption = circle.querySelector('figcaption');
    const potSub = circle.querySelector('.pot-sub');
    const names = members.map((m) => m.dataset.name);
    const n = members.length;
    const amount = circle.dataset.pot;
    let turn = 2;
    let timers = [];
    let visible = true;

    const clear = () => {
      timers.forEach(clearTimeout);
      timers = [];
    };
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));

    function play() {
      clear();
      if (!visible) return;
      members.forEach((m) => m.classList.remove('paid', 'receives'));
      const ben = members[turn];
      ben.classList.add('receives');
      potSub.textContent = `tour ${turn + 1} sur ${n}`;
      caption.innerHTML = `Tour ${turn + 1} sur ${n} : les membres cotisent pour <strong>${names[turn]}</strong>.`;
      let k = 0;
      for (let i = 1; i < n; i++) {
        const m = members[(turn + i) % n];
        at(600 + i * 330, () => {
          m.classList.add('paid');
          k++;
          caption.innerHTML = `Tour ${turn + 1} sur ${n} : ${k} membre${k > 1 ? 's ont' : ' a'} cotisé pour <strong>${names[turn]}</strong>.`;
        });
      }
      at(600 + n * 330 + 300, () => {
        caption.innerHTML = `Cagnotte complète : <strong>${names[turn]}</strong> reçoit ${amount}. Au tour suivant.`;
      });
      at(600 + n * 330 + 2600, () => {
        turn = (turn + 1) % n;
        play();
      });
    }

    const io = new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting;
      if (visible && !was) play();
      if (!visible) clear();
    });
    io.observe(circle);
    play();
  }

  // Portail : état de l'API
  const status = document.getElementById('api-status');
  if (status) {
    fetch('/v1/health', { headers: { Accept: 'application/json' } })
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        status.classList.add(ok ? 'ok' : 'warn');
        status.querySelector('span').textContent = ok
          ? 'API opérationnelle'
          : body.status === 'configuration_incomplete'
            ? 'API en cours de configuration : paiements pas encore ouverts'
            : 'API indisponible';
      })
      .catch(() => {
        status.classList.add('warn');
        status.querySelector('span').textContent = 'État de l’API indisponible';
      });
  }

  // Portail : formulaire de demande de clé API
  const form = document.getElementById('key-form');
  if (form) {
    const out = document.getElementById('key-result');
    const submit = form.querySelector('button[type=submit]');
    const showErrors = (details = []) => {
      form.querySelectorAll('.error').forEach((e) => e.remove());
      form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
      for (const d of details) {
        const input = form.elements[d.path];
        if (!input || !input.closest) continue;
        input.setAttribute('aria-invalid', 'true');
        const p = document.createElement('p');
        p.className = 'error';
        p.id = `err-${d.path}`;
        p.textContent = d.message;
        input.setAttribute('aria-describedby', p.id);
        input.closest('.field, .check').appendChild(p);
      }
    };
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      out.hidden = true;
      const f = new FormData(form);
      const body = Object.fromEntries([...f.entries()].filter(([k]) => k !== 'consent'));
      body.consent = f.get('consent') === 'on';
      submit.disabled = true;
      submit.textContent = 'Envoi…';
      try {
        const r = await fetch('/v1/developers/key-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok) {
          showErrors([]);
          form.hidden = true;
          out.className = 'alert ok';
          out.innerHTML = `<strong>Demande envoyée (n° ${data.id}).</strong> Nous l’examinons et répondons par e-mail à ${body.email}. La clé n’est jamais envoyée en clair par e-mail : nous conviendrons ensemble d’un canal sûr.`;
        } else {
          showErrors(data?.error?.details || []);
          out.className = 'alert err';
          out.textContent = data?.error?.details?.length ? 'Certains champs sont à corriger.' : data?.error?.message || 'La demande n’a pas pu être envoyée. Réessaie dans un instant.';
        }
      } catch {
        out.className = 'alert err';
        out.textContent = 'Pas de connexion. Vérifie ton réseau et réessaie.';
      } finally {
        out.hidden = false;
        submit.disabled = false;
        submit.textContent = 'Envoyer la demande';
        out.focus();
      }
    });
  }
})();
