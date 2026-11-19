import { h, render } from 'preact';
import { Dashboard } from '../../dashboard/shell/Dashboard';
import { primeTheme } from '../../ui/theme';
import { watchToolkitColors } from '../../ui/tokens';
import '../../ui/toolkit.css';
import '../../ui/theme.css';
import '../../dashboard/shell/dashboard.css';

// Before the first render, so a dark-theme operator never sees a light flash.
primeTheme();
// The Toolkit colours preview samples --mhx-pg-* from this root, so keep it
// in step with storage.
watchToolkitColors();

const root = document.getElementById('app');
if (root) render(<Dashboard />, root);
