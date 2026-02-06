document.addEventListener("DOMContentLoaded", () => {
  

  function updateTime() {
    const now = new Date();
    
    // Update Jam (Format 24 jam)
    const timeEl = document.getElementById("time");
    if (timeEl) {
        timeEl.textContent = now.toLocaleTimeString("en-GB"); // en-GB biasanya format 24 jam (HH:MM:SS)
    }

    // Update Tanggal (Format Indonesia)
    const dateEl = document.getElementById("date");
    if (dateEl) {
        dateEl.textContent = now.toLocaleDateString("id-ID"); // DD/MM/YYYY
    }
  }

  // Jalankan fungsi setiap 1000ms (1 detik)
  setInterval(updateTime, 1000);
  
  // Jalankan sekali di awal agar tidak menunggu 1 detik baru muncul
  updateTime();


  
  const storageKey = "theme-preference";
  const themeToggleBtn = document.querySelector("#theme-toggle");
  const logo = document.getElementById("logo-aterolas");

  const getColorPreference = () => {
    if (localStorage.getItem(storageKey)) {
      return localStorage.getItem(storageKey);
    } else {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
  };

  const theme = { value: getColorPreference() };

  const reflectPreference = () => {
    document.firstElementChild.setAttribute("data-theme", theme.value);
    
    if (theme.value === "dark") {
      document.body.classList.add("dark-mode");
      if (logo) logo.src = "assets/title-dark.png"; 
    } else {
      document.body.classList.remove("dark-mode");
      if (logo) logo.src = "assets/title-dark.png"; // Sesuaikan kalo ada logo terang
    }
  };

  const setPreference = () => {
    localStorage.setItem(storageKey, theme.value);
    reflectPreference();
  };

  const onClickTheme = () => {
    theme.value = theme.value === "light" ? "dark" : "light";
    setPreference();
  };

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", onClickTheme);
  }
  
  reflectPreference();


  
  const loginModal = document.getElementById("login-modal");
  const settingsBtn = document.querySelector(".settings-toggle");
  const cancelBtn = document.getElementById("login-cancel");

  if(settingsBtn) {
      settingsBtn.onclick = () => {
          loginModal.classList.add("show");
      }
  }

  if(cancelBtn) {
      cancelBtn.onclick = () => {
          loginModal.classList.remove("show");
      }
  }

  

});