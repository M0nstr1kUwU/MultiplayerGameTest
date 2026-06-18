import { authApi } from '../net/api.js';

export function renderAuth(root, onAuth) {
  root.innerHTML = `
    <div class="screen">
      <form class="card stack" id="auth-form">
        <h1>Soul Knight 3D</h1>
        <input id="username" placeholder="Имя игрока" autocomplete="username" />
        <input id="password" placeholder="Пароль" type="password" autocomplete="current-password" />
        <div class="row">
          <button id="login" type="submit">Войти</button>
          <button id="register" class="secondary" type="button">Регистрация</button>
        </div>
        <div class="error" id="error"></div>
      </form>
    </div>
  `;

  const form = root.querySelector('#auth-form');
  const error = root.querySelector('#error');
  const read = () => ({ username: root.querySelector('#username').value, password: root.querySelector('#password').value });

  async function submit(register = false) {
    error.textContent = '';
    try {
      const { username, password } = read();
      const data = register ? await authApi.register(username, password) : await authApi.login(username, password);
      onAuth(data);
    } catch (e) {
      error.textContent = e.message;
    }
  }

  form.addEventListener('submit', (event) => { event.preventDefault(); submit(false); });
  root.querySelector('#register').addEventListener('click', () => submit(true));
}
