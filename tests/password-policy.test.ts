import test from 'node:test';
import assert from 'node:assert/strict';
test('account management policy accepts six, rejects five, preserves empty optional updates',async()=>{
 const policy=await import('../src/lib/password-policy').catch(()=>null);
 assert.ok(policy,'shared password policy must exist');
 assert.equal(policy.MIN_PASSWORD_LENGTH,6);
 assert.equal(policy.passwordSchema.safeParse('abcdef').success,true);
 assert.equal(policy.passwordSchema.safeParse('abcde').success,false);
 assert.equal(policy.optionalPasswordSchema.safeParse('').success,true);
 assert.equal(policy.optionalPasswordSchema.safeParse(undefined).success,true);
 assert.equal(policy.optionalPasswordSchema.safeParse('abcde').success,false);
 assert.equal(policy.optionalPasswordSchema.safeParse('abcdef').success,true);
});
