from test_full_conversion import FullTests, read, BASE
import batch_plan as b
import full_conversion as f
import full_regions as regions
import rendered_layout as r
import batch_apply as a


class PreserveReviewTests(FullTests):
    def existing_review(self):
        page = self.page('39')
        state = b.page_state(read(BASE / 'captures/pp39.json'))
        review = next(n.raw for n in regions.parse(page['desired_body'])
                      if r.review_state(n, '39') is not None)
        image = next(n.raw for n in regions.parse(state['body']) if n.kind == 'image')
        state['body'] = image + '\n\n' + state['body'].replace(image, '', 1)
        table = next(n for n in regions.parse(state['body']) if n.kind == 'table')
        state['body'] = state['body'][:table.start] + review + '\n\n' + state['body'][table.start:]
        return page, state, review

    def test_five_child_review_and_prefix_are_untouched(self):
        page, state, review = self.existing_review()
        self.assertEqual(len(regions.parse(review)[0].items), 5)
        prefix = state['body'][:state['body'].index(review) + len(review)]
        desired, operations, proof = f.render(state, page['excel'], page['new_groups'], [], 'preserve-review')
        self.assertNotIn('blocked_region', proof)
        self.assertTrue(operations)
        body = state['body']
        for operation in operations:
            payload = operation['payload']
            if payload['command'] == 'update_content':
                self.assertNotIn(review, payload['content_updates'][0]['old_str'])
            after, _ = a.apply_model(body, b.stable_metadata(state), payload)
            self.assertTrue(after.startswith(prefix))
            self.assertTrue(regions.saved(body, after, payload))
            self.assertFalse(regions.saved(body, after.replace('- [ ] Não,', '- [x] Não,', 1), payload))
            body = after
        self.assertEqual(body, desired)
        f.validate_layout(desired, '39')
        self.assertEqual(next(n.raw for n in regions.parse(desired)
                              if r.review_state(n, '39') is not None), review)

    def test_unknown_structure_stays_blocked(self):
        page, state, _ = self.existing_review()
        state['body'] += '\n\n<custom-block definition-id="unknown" />'
        with self.assertRaises(ValueError):
            f.render(state, page['excel'], page['new_groups'], [], 'unknown')

    def test_missing_column_evidence_stays_blocked(self):
        page = self.page('262')
        state = b.page_state(read(BASE / 'captures/pp262.json'))
        _, operations, proof = f.render(state, page['excel'], page['new_groups'],
                                        page['technical_unresolved'], 'partial')
        self.assertEqual(operations, [])
        self.assertIn('blocked_region', proof)

    def test_single_paragraph_container_support_unchanged(self):
        state = {'page_id': '00000000-0000-4000-8000-000000000001'}
        node = regions.parse('<callout>Own note</callout>')[0]
        evidence = {'page_id': state['page_id'], 'global_export_claimed': False,
                    'source_state_sha256': 'current', 'regions': [{
                        'kind': 'callout', 'id': '00000000-0000-4000-8000-000000000002',
                        'children': ['00000000-0000-4000-8000-000000000003'], 'text': 'Own note'}]}
        self.assertIsNotNone(regions.verified_container(node, state, evidence))
        evidence['regions'][0]['text'] = 'Other note'
        self.assertIsNone(regions.verified_container(node, state, evidence))

    def test_stale_browser_state_stays_blocked(self):
        import shutil
        captures = self.work / 'captures'
        shutil.copytree(BASE / 'captures', captures)
        evidence = read(captures / 'browser-regions.json')
        evidence['pages']['262']['source_edited_at'] = '2000-01-01T00:00:00Z'
        a.atomic(captures / 'browser-regions.json', evidence)
        output = self.work / 'stale.json'
        f.prepare(captures, self.bundle['excel']['workbook'], BASE / 'input/workbook-index.json',
                  BASE / 'input/inventory-current.json', ['262'], output)
        page = read(output)['pages'][0]
        self.assertEqual(page['operations'], [])
        self.assertFalse(page['method_complete'])
        self.assertIn('outro estado', page['full_prepare_error'])
