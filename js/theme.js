// Dark / Light / Auto theme picker. The inline script in <head> applies the
// saved choice before first paint; this file wires up the picker.
(function () {
    const select = document.getElementById('theme');
    if (!select) return;

    const media = window.matchMedia('(prefers-color-scheme: light)');
    const themeColor = document.querySelector('meta[name="theme-color"]');

    function load() {
        try { return localStorage.getItem('theme') || 'dark'; } catch (e) { return 'dark'; }
    }

    function save(choice) {
        try { localStorage.setItem('theme', choice); } catch (e) { }
    }

    function apply(choice) {
        const light = choice === 'light' || (choice === 'auto' && media.matches);
        document.documentElement.dataset.theme = light ? 'light' : 'dark';
        if (themeColor) themeColor.content = light ? '#f7f8f9' : '#1a1e23';
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
