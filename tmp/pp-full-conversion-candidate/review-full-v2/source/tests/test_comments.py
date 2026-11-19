import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import batch_plan as b

EMPTY={'suggested_edits_status':'available','text':'<discussions shown-count="0" total-count="0" />'}
UNAVAILABLE={'suggested_edits_status':'upgrade_required'}


def dual(structured,displayed):
    return {'structuredContent':structured,'content':[{'type':'text','text':json.dumps(displayed)}],'isError':False}


class CommentProofTests(unittest.TestCase):
    def test_exact_conflict_is_refused_in_both_directions(self):
        for first,second in [(EMPTY,UNAVAILABLE),(UNAVAILABLE,EMPTY)]:
            with self.subTest(structured=first):self.assertIs(b.comments_proof(dual(first,second))['empty'],False)

    def test_equal_and_single_well_formed_complete_empty_representations(self):
        xml='<discussions shown-count="0" total-count="0" suggested_edits_status="available" />'
        for response in [dual(EMPTY,copy.deepcopy(EMPTY)),{'structuredContent':EMPTY},
                         {'content':[{'type':'text','text':json.dumps(EMPTY)}]},
                         {'content':[{'type':'text','text':xml}]}]:
            with self.subTest(response=response):self.assertIs(b.comments_proof(response)['empty'],True)

    def test_tool_and_embedded_errors_unknown_or_incomplete_shapes_fail_closed(self):
        for response in [None,[],{}, {'content':None},dual(UNAVAILABLE,UNAVAILABLE),
                         {**dual(EMPTY,EMPTY),'isError':True},
                         {**dual(EMPTY,EMPTY),'error':'failed'},
                         {'structuredContent':{**EMPTY,'isError':True}},
                         {'structuredContent':{**EMPTY,'error':'failed'}},
                         {'structuredContent':{**EMPTY,'has_more':True}},
                         {'structuredContent':{**EMPTY,'unknown_block_count':0}},
                         {'structuredContent':{'text':EMPTY['text']}},
                         {'structuredContent':EMPTY,'content':[{'type':'image','text':json.dumps(EMPTY)}]}]:
            with self.subTest(response=response):self.assertIs(b.comments_proof(response)['empty'],False)

    def test_xml_pagination_omissions_errors_and_unknown_content_are_refused(self):
        for xml in [
            '<discussions shown-count="0" total-count="1" />',
            '<discussions shown-count="0" total-count="0" next-cursor="next" />',
            '<discussions shown-count="0" total-count="0" has_more="false" />',
            '<discussions shown-count="0" total-count="0" omitted-truncated="true" />',
            '<discussions shown-count="0" total-count="0" suggested_edits_status="upgrade_required" />',
            '<discussions shown-count="0" total-count="0">unknown</discussions>',
            '<discussions shown-count="0" total-count="0"><!-- omitted --></discussions>',
            '<discussions shown-count="0" total-count="0"><error /></discussions>',
            '<discussions shown-count="0" total-count="0">',
        ]:
            with self.subTest(xml=xml):self.assertIs(b.comments_proof({'structuredContent':{**EMPTY,'text':xml}})['empty'],False)


if __name__=='__main__':unittest.main()
