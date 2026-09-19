// Открытие/закрытие дропдауна по клику
document.querySelectorAll('.dropbtn').forEach(function(button) {
  button.addEventListener('click', function(e) {
    e.stopPropagation();

    var dropdown = button.parentElement;
    var isOpen = dropdown.classList.contains('show');

    // Закрываем все открытые дропдауны
    document.querySelectorAll('.dropdown.show').forEach(function(d) {
      d.classList.remove('show');
      var b = d.querySelector('.dropbtn');
      if (b) b.setAttribute('aria-expanded', 'false');
    });

    // Открываем текущий, если был закрыт
    if (!isOpen) {
      dropdown.classList.add('show');
      button.setAttribute('aria-expanded', 'true');
    }
  });
});

// Закрытие при клике вне дропдауна
document.addEventListener('click', function(e) {
  document.querySelectorAll('.dropdown.show').forEach(function(dropdown) {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove('show');
      var btn = dropdown.querySelector('.dropbtn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  });
});