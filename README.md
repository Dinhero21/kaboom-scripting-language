# Kaboom Scripting Language

General Purpose Scripting Language

Originally designed for [kaboom](https://kaboom.pw/) bots

Run the project for a [REPL](https://en.wikipedia.org/wiki/Read%E2%80%93eval%E2%80%93print_loop).

Example programs:

```
> say Hello World!
Hello World!
> say a; say b
a
b
> for i in range 10 do say $i
0
1
2
3
4
5
6
7
8
9
> for i in range 10 do { sleep 100; say $i }
0
1
2
3
4
5
6
7
8
9
```

Known limitations:

- `for` loops with empty iterables don't consume the command (what comes after `do`) which makes it so when commands are evaluated "totally" (unconsumed data is interpreted as new commands), they will be interpreted as commands
  Example:
  ```
  > for i in range 0 do say $i
  Empty iterable, command never evaluated, offsets not applied
  command (what comes after "do") might be evaluated outside of the for loop
  for i in range 0 do say $i
                           ^
  Unknown variable "i"
  ```
  `$i` is unknown since `say $i` is running in the "global" context and the for loop actually ended on the `do`
