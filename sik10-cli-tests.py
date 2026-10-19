import ast,pathlib,sys
s=pathlib.Path(__file__).with_name('sik09-runtime.py').read_text()
t=ast.parse(s)
# Only execute parser prefix. Any later source evaluation is a test failure.
prefix=s[:s.index('import pathlib,os,subprocess')]
for args,expected in [(['--help'],0),(['--unknown'],2),([],2),(['--execute','--unknown'],2)]:
 sys.argv=['sik09-runtime.py']+args
 try:exec(compile(prefix,'parser-prefix','exec'),{});raise AssertionError('parser unexpectedly continued')
 except SystemExit as e:assert e.code==expected
print('PASS help0 unknown2 default2 before all runtime imports/side effects')
