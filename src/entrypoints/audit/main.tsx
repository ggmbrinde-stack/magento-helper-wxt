import { h, render } from 'preact';
import { AuditDashboard } from '../../dashboard/AuditDashboard';
import { primeTheme } from '../../lib/theme';
import '../sidepanel/panel.css';
import '../../lib/theme.css';
import '../../dashboard/dashboard.css';

// Before the first render, so a dark-theme operator never sees a light flash.
primeTheme();

const root = document.getElementById('app');
if (root) render(<AuditDashboard />, root);
