import importlib.util
from pathlib import Path
from unittest.mock import Mock

def module():
    path=Path(__file__).resolve().parents[1]/'lambda_functions/apple_auth_challenge/index.py'
    spec=importlib.util.spec_from_file_location('apple_challenge',path)
    result=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def test_public_challenge_does_not_expose_answer():
    app=module(); db=Mock(); app._table=lambda:db
    response=app.handler({'triggerSource':'CreateAuthChallenge_Authentication','userName':'user-id','request':{},'response':{}},None)['response']
    secret=db.put_item.call_args.kwargs['Item']['answer']
    assert secret not in response['publicChallengeParameters'].values()
    assert 'answerHash' in response['privateChallengeParameters']


def test_wrong_answer_never_consumes_challenge_or_authenticates():
    app=module(); db=Mock(); app._table=lambda:db
    result=app.handler({'triggerSource':'VerifyAuthChallengeResponse_Authentication','userName':'user-id',
        'request':{'challengeAnswer':'wrong','privateChallengeParameters':{'answerHash':'different'}}},None)
    assert not result['response']['answerCorrect']
    db.delete_item.assert_not_called()


def test_valid_answer_requires_live_one_time_record():
    app=module(); db=Mock(); app._table=lambda:db
    parameters={'challengeId':'one','answerHash':app.hashlib.sha256(b'answer').hexdigest()}
    event={'triggerSource':'VerifyAuthChallengeResponse_Authentication','userName':'user-id',
        'request':{'challengeAnswer':'answer','privateChallengeParameters':parameters}}
    assert app.handler(event,None)['response']['answerCorrect']
    assert 'expires > :now' in db.delete_item.call_args.kwargs['ConditionExpression']
    db.delete_item.side_effect=RuntimeError('already consumed or expired')
    assert not app.handler(event,None)['response']['answerCorrect']


def test_cognito_only_issues_tokens_after_successful_custom_challenge():
    app=module()
    for success in (False,True):
        result=app.handler({'triggerSource':'DefineAuthChallenge_Authentication',
            'request':{'session':[{'challengeName':'CUSTOM_CHALLENGE','challengeResult':success}]}},None)['response']
        assert result['issueTokens'] is success
    result=app.handler({'triggerSource':'DefineAuthChallenge_Authentication',
        'request':{'session':[{'challengeName':'CUSTOM_CHALLENGE','challengeResult':False}]*3}},None)['response']
    assert result['failAuthentication'] and not result['issueTokens']
