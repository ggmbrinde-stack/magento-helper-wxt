"""One reviewed group per process; exact identities still require fresh source checks."""
import re
import uuid
import rendered_layout as r

WORKING_COPY='collection://431b6705-ae1f-83db-b71c-0739778f9e1a'
PROTECTED={'434b6705ae1f83729d2e070435a4f043','166b6705ae1f83dabe9287f8d804a1a5'}


def configure(manifest):
    if manifest.get('collection')!=WORKING_COPY or not manifest.get('group_id') or not manifest.get('review_scope'):
        raise ValueError('An explicitly selected reviewed Working Copy group is required')
    values=manifest.get('targets')
    if not isinstance(values,dict) or not values:raise ValueError('No reviewed target identities')
    targets={}
    for code,item in values.items():
        if not re.fullmatch(r'[0-9]+',code) or not isinstance(item,dict):raise ValueError('Invalid exact business code')
        page=uuid.UUID(item['page_id']).hex
        if page in PROTECTED or page in targets.values():raise ValueError('Protected or duplicate target')
        if code=='601' and item.get('mode')!='NO_CHANGE':raise ValueError('PP601 is an explicit do-not-change exception')
        targets[code]=page
    r.PAGES.clear();r.PAGES.update(targets)
    return targets
