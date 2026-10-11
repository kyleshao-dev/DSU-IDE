import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { defaultConfig } from '../src/core/config';
import { inspectToolchains } from '../src/core/toolchains';
import { runSamples } from '../src/core/runner';

const programs: Record<string, string> = {
  cpp: '#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}',
  c: '#include <stdio.h>\nint main(void){long long a,b;scanf("%lld%lld",&a,&b);printf("%lld\\n",a+b);}',
  python: 'import sys\na,b=map(int,sys.stdin.read().split());print(a+b)\n',
  java: 'import java.util.*;public class Main{public static void main(String[]args){Scanner s=new Scanner(System.in);System.out.println(s.nextLong()+s.nextLong());}}',
  javascript: "const a=require('fs').readFileSync(0,'utf8').trim().split(/\\s+/).map(Number); console.log(a[0]+a[1]);",
  typescript: "declare function require(name:string):any;const a:number[]=require('fs').readFileSync(0,'utf8').trim().split(/\\s+/).map(Number);console.log(a[0]+a[1]);",
  go: 'package main\nimport("fmt")\nfunc main(){var a,b int64;fmt.Scan(&a,&b);fmt.Println(a+b)}',
  rust: 'use std::io::{self,Read};fn main(){let mut s=String::new();io::stdin().read_to_string(&mut s).unwrap();let v:Vec<i64>=s.split_whitespace().map(|x|x.parse().unwrap()).collect();println!("{}",v[0]+v[1]);}',
  csharp: 'using System;class MainClass{static void Main(){var v=Console.In.ReadToEnd().Split((char[])null,StringSplitOptions.RemoveEmptyEntries);Console.WriteLine(long.Parse(v[0])+long.Parse(v[1]));}}',
  kotlin: 'fun main(){val s=java.util.Scanner(System.`in`);println(s.nextLong()+s.nextLong())}',
  swift: 'import Foundation\nlet s=String(data:FileHandle.standardInput.readDataToEndOfFile(),encoding:.utf8)!\nlet a=s.split(whereSeparator:{$0.isWhitespace}).map{Int($0)!}\nprint(a[0]+a[1])',
  ruby: 'a,b=STDIN.read.split.map(&:to_i);puts a+b',
  php: '<?php $a=preg_split("/\\s+/",trim(stream_get_contents(STDIN)));echo (intval($a[0])+intval($a[1]))."\\n";',
  pascal: 'program Main;var a,b:Int64;begin read(a,b);writeln(a+b);end.',
  lua: 'local a,b=io.read("*n","*n");print(a+b)',
  haskell: 'main :: IO ()\nmain = do\n s <- getContents\n print (sum (map read (words s)) :: Integer)\n',
  scala: 'object Main extends App { val s=new java.util.Scanner(System.in); println(s.nextLong()+s.nextLong()) }'
};
async function main() {
const folder = await mkdtemp(path.join(os.tmpdir(), 'dsu language smoke '));
const results: { language: string; status: string; detail: unknown }[] = [];
try {
  const states = await inspectToolchains(defaultConfig.languages, process.cwd());
  for (const language of defaultConfig.languages) {
    const state = states.find(s => s.id === language.id)!;
    if (!state.ready) { results.push({ language: language.id, status: 'NOT_INSTALLED', detail: state.tools.filter(t => !t.path).map(t => t.command) }); continue; }
    const file = path.join(folder, `A + B.${language.extension}`); await writeFile(file, programs[language.id]);
    const samples = await runSamples(file, language, [{ input: '20 30\n', output: '50\n' }, { input: '-7 2\n', output: '-5\n' }], { ...defaultConfig, compileTimeoutMs: 120000, timeoutMs: 10000 });
    results.push({ language: language.id, status: samples.every(s => s.status === 'AC') ? 'PASS' : 'FAIL', detail: samples });
    console.log(`${language.name}: ${results.at(-1)!.status}`);
  }
  await mkdir('dist/validation', { recursive: true });
  await writeFile('dist/validation/toolchains.json', JSON.stringify({ date: new Date().toISOString(), platform: process.platform, arch: process.arch, results }, null, 2));
  console.log(JSON.stringify(results.map(r => ({ language: r.language, status: r.status })), null, 2));
  if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
} finally { await rm(folder, { recursive: true, force: true }); }

}
void main().catch(e => { console.error(e); process.exitCode = 1; });
