import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'eventos' },
  {
    path: 'usuarios',
    title: 'Usuários e perfis',
    loadComponent: () => import('./pages/users.page').then((m) => m.UsersPage),
  },
  {
    path: 'eventos',
    title: 'Eventos',
    loadComponent: () => import('./pages/events.page').then((m) => m.EventsPage),
  },
  {
    path: 'eventos/:id',
    title: 'Evento',
    loadComponent: () => import('./pages/event-detail.page').then((m) => m.EventDetailPage),
  },
  {
    path: 'pendencias',
    title: 'Pendências',
    loadComponent: () => import('./pages/pendencies.page').then((m) => m.PendenciesPage),
  },
  {
    path: 'pendencias/:id',
    title: 'Pendência',
    loadComponent: () => import('./pages/pendency-detail.page').then((m) => m.PendencyDetailPage),
  },
  {
    path: 'notificacoes',
    title: 'Notificações',
    loadComponent: () => import('./pages/notifications.page').then((m) => m.NotificationsPage),
  },
  {
    path: 'fluxos',
    title: 'Fluxos',
    loadComponent: () => import('./pages/flows.page').then((m) => m.FlowsPage),
  },
  {
    path: 'fluxos/:id',
    title: 'Editor de fluxo',
    loadComponent: () => import('./pages/flow-editor.page').then((m) => m.FlowEditorPage),
  },
  {
    path: 'roteiro',
    title: 'Roteiro de testes',
    loadComponent: () => import('./pages/scenario.page').then((m) => m.ScenarioPage),
  },
  { path: '**', redirectTo: 'eventos' },
];
