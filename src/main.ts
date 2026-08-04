import './styles/tokens.css';
import './styles/app.css';
import { bootstrap } from './app/bootstrap';
import { mountApp } from './ui/render';
import { registerOfflineSupport } from './infrastructure/pwa';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('App root was not found');

bootstrap()
  .then((controller) => {
    mountApp(root, controller);
    void registerOfflineSupport();
  })
  .catch(() => {
    root.innerHTML = '<main class="fatal"><h1>暂时无法开始</h1><p>请刷新页面后再试。</p></main>';
  });
