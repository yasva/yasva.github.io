// Dark / Light / Auto theme picker. The inline script in <head> applies the
// saved choice before first paint; this file wires up the picker.
(function () {
    const select = document.getElementById('theme');
    if (!select) return;

    const icon = document.querySelector('.theme-icon path');
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const themeColor = document.querySelector('meta[name="theme-color"]');

    const ICONS = {
        dark: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
        light: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
        auto: 'M3 5h18v11H3zM1 19h22',
    };

    function load() {
        try { return localStorage.getItem('theme') || 'auto'; } catch (e) { return 'auto'; }
    }

    function save(choice) {
        try { localStorage.setItem('theme', choice); } catch (e) { }
    }

    function apply(choice) {
        const light = choice === 'light' || (choice === 'auto' && media.matches);
        document.documentElement.dataset.theme = light ? 'light' : 'dark';
        if (themeColor) themeColor.content = light ? '#f7f8f9' : '#1a1e23';
        if (icon) icon.setAttribute('d', ICONS[choice]);
    }

    select.value = load();
    apply(select.value);

    select.addEventListener('change', () => {
        save(select.value);
        apply(select.value);
    });

    // Follow the system setting while "Auto" is chosen
    media.addEventListener('change', () => {
        if (select.value === 'auto') apply('auto');
    });
})();
