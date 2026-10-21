import { h, render } from 'preact';
import { Dashboard } from '../../dashboard/Dashboard';
import '../sidepanel/panel.css';
import '../../dashboard/dashboard.css';

const root = document.getElementById('app');
if (root) render(<Dashboard />, root);
