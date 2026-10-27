import { h, render } from 'preact';
import { Dashboard } from '../../dashboard/Dashboard';
import { primeTheme } from '../../lib/theme';
import { watchToolkitColors } from '../../ui/tokens';
import '../../ui/toolkit.css';
import '../../lib/theme.css';
import '../../dashboard/dashboard.css';

// Before the first render, so a dark-theme operator never sees a light flash.
primeTheme();
// The Toolkit colours preview samples --mhx-pg-* from this root, so keep it
// in step with storage.
watchToolkitColors();

const root = document.getElementById('app');
if (root) render(<Dashboard />, root);
