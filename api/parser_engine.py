"""
parser_engine.py - SAFE interpreter for a subset of Arduino C++.

SECURITY: user code is NEVER passed to eval()/exec(). It is tokenized, parsed
into a small AST (tuples) and walked by our own interpreter. Only the whitelisted
functions in Runtime._call exist, so students cannot touch the server.

Supported: global/local variables (int float long bool byte, const), #define,
setup()/loop(), if / else if / else, blocks, = += -= ++ --, arithmetic,
comparisons, && || !, pinMode, digitalRead/Write, analogRead, map, constrain,
min, max, abs, delay (ignored), Serial.begin/print/println.

Extension points for other courses: add a builtin in Runtime._call, a new
statement in Parser.statement and its handler in Runtime.exec.
"""
import re

MAX_STEPS = 20000  # guard against runaway code (keeps the server responsive)
TYPES = {"int", "long", "float", "double", "bool", "boolean", "byte", "void"}
SKIP = {"const", "unsigned", "static", "volatile"}
CONSTS = {"HIGH": 1, "LOW": 0, "INPUT": 0, "OUTPUT": 1, "INPUT_PULLUP": 2,
          "true": 1, "false": 0, "LED_BUILTIN": 13,
          **{f"A{i}": 14 + i for i in range(6)}}  # A0..A5 are pins 14..19


class CodeError(Exception):
    """Friendly error shown in the Serial Monitor (never crashes the server)."""
    def __init__(self, msg, line=0):
        super().__init__(msg); self.msg, self.line = msg, line
    def __str__(self):
        return f"line {self.line}: {self.msg}" if self.line else self.msg


# ---------------------------------------------------------------- tokenizer
TOKEN = re.compile(
    r'(?P<ws>[ \t\r]+)|(?P<nl>\n)|(?P<cm>//[^\n]*|/\*.*?\*/)'
    r'|(?P<str>"(?:\\.|[^"\\])*")|(?P<num>\d+\.\d+|\d+)|(?P<id>[A-Za-z_]\w*)'
    r'|(?P<op>&&|\|\||==|!=|<=|>=|\+\+|--|\+=|-=|[-+*/%<>=!(){};,.])', re.S)


def preprocess(code):
    """Handle #define / #include textually; keep line numbers unchanged."""
    defs, out = {}, []
    for ln in code.split("\n"):
        m = re.match(r"\s*#define\s+(\w+)\s+(.+?)\s*$", ln)
        if m: defs[m.group(1)] = m.group(2); out.append(""); continue
        out.append("" if ln.strip().startswith("#") else ln)
    text = "\n".join(out)
    for k, v in defs.items():
        text = re.sub(rf"\b{k}\b", f"({v})", text)
    return text


def tokenize(code):
    toks, pos, line = [], 0, 1
    while pos < len(code):
        m = TOKEN.match(code, pos)
        if not m: raise CodeError(f"Unexpected character {code[pos]!r}", line)
        kind, text = m.lastgroup, m.group()
        if kind not in ("ws", "nl", "cm"): toks.append((kind, text, line))
        line += text.count("\n")
        pos = m.end()
    toks.append(("eof", "", line))
    return toks


# ------------------------------------------------------------------- parser
class Parser:
    def __init__(self, toks): self.t, self.i = toks, 0
    def peek(self, k=0): return self.t[min(self.i + k, len(self.t) - 1)]
    def next(self): tok = self.peek(); self.i += 1; return tok
    def at(self, val, k=0): return self.peek(k)[1] == val and self.peek(k)[0] in ("op", "id")

    def expect(self, val):
        k, v, ln = self.next()
        if v != val: raise CodeError(f"Expected '{val}' but found '{v or 'end of file'}'", ln)
        return ln

    def program(self):
        """Top level: global variables and void functions (setup/loop)."""
        gl, fn = [], {}
        while self.peek()[0] != "eof":
            while self.peek()[1] in SKIP: self.next()
            kind, ty, ln = self.next()
            if ty not in TYPES: raise CodeError(f"Unknown or unsupported statement '{ty}'", ln)
            name = self.next()
            if name[0] != "id": raise CodeError("Expected a name", name[2])
            if self.at("("):
                self.next(); self.expect(")")
                fn[name[1]] = self.block()
            else:
                self.i -= 1; gl += self.decl_rest()
        for need in ("setup", "loop"):
            if need not in fn: raise CodeError(f"Missing 'void {need}()' function")
        return gl, fn

    def decl_rest(self):
        """name [= expr] {, name [= expr]} ;  -> list of ('decl', name, expr)"""
        out = []
        while True:
            name = self.next()
            init = None
            if self.at("="): self.next(); init = self.expr()
            out.append(("decl", name[1], init, name[2]))
            if self.at(","): self.next(); continue
            self.expect(";"); return out

    def block(self):
        self.expect("{"); body = []
        while not self.at("}"):
            if self.peek()[0] == "eof": raise CodeError("Missing closing '}'", self.peek()[2])
            body.append(self.statement())
        self.next(); return ("block", body)

    def statement(self):
        k, v, ln = self.peek()
        if v == "{": return self.block()
        if v == "if":
            self.next(); self.expect("("); c = self.expr(); self.expect(")")
            then, other = self.statement(), None
            if self.at("else"): self.next(); other = self.statement()  # 'else if' recurses here
            return ("if", c, then, other)
        while self.peek()[1] in SKIP: self.next()
        if self.peek()[1] in TYPES - {"void"}:
            self.next(); return ("block", self.decl_rest(), True)  # True = no new scope
        if k == "id" and self.peek(1)[1] in ("=", "+=", "-=", "++", "--"):
            name = self.next(); op = self.next()[1]
            val = ("num", 1) if op in ("++", "--") else self.expr()
            self.expect(";"); return ("assign", name[1], op[0] if op != "=" else "=", val, ln)
        e = self.expr(); self.expect(";"); return ("expr", e)

    # precedence climbing: || < && < == != < relational < + - < * / % < unary
    def expr(self): return self.binary(0)
    LEVELS = [("||",), ("&&",), ("==", "!="), ("<", "<=", ">", ">="), ("+", "-"), ("*", "/", "%")]

    def binary(self, lvl):
        if lvl == len(self.LEVELS): return self.unary()
        left = self.binary(lvl + 1)
        while self.peek()[0] == "op" and self.peek()[1] in self.LEVELS[lvl]:
            op, ln = self.next()[1], self.peek()[2]
            left = ("bin", op, left, self.binary(lvl + 1), ln)
        return left

    def unary(self):
        if self.peek()[0] == "op" and self.peek()[1] in ("!", "-"):
            return ("un", self.next()[1], self.unary())
        return self.primary()

    def primary(self):
        k, v, ln = self.next()
        if k == "num": return ("num", float(v) if "." in v else int(v))
        if k == "str": return ("str", bytes(v[1:-1], "utf-8").decode("unicode_escape"))
        if v == "(": e = self.expr(); self.expect(")"); return e
        if k == "id":
            name = v
            if self.at(".") and self.peek(1)[0] == "id":  # Serial.println
                self.next(); name += "." + self.next()[1]
            if self.at("("):
                self.next(); args = []
                while not self.at(")"):
                    args.append(self.expr())
                    if self.at(","): self.next()
                    elif not self.at(")"): raise CodeError("Missing ')' in function call", ln)
                self.next(); return ("call", name, args, ln)
            return ("var", name, ln)
        raise CodeError(f"Unexpected '{v or 'end of file'}'", ln)


def compile_code(code):
    """Parse source text. Raises CodeError. Returns (globals, functions)."""
    return Parser(tokenize(preprocess(code))).program()


# -------------------------------------------------------------- interpreter
class Runtime:
    """Holds sketch state between ticks (globals, pin modes, output levels)."""

    def __init__(self, code):
        self.globals_ast, self.fns = compile_code(code)
        self.vars, self.outputs, self.modes, self.in_fn = {}, {}, {}, False
        self.io = {"digital": {}, "analog": {}}
        self.serial, self.buf, self.steps, self.local = [], "", 0, {}
        self.high_seen = set()   # pins driven HIGH during the current loop()/setup() run (pulseIn needs the TRIG pulse)
        for d in self.globals_ast: self.exec(d)   # initialise globals once

    def run(self, fn, io):
        """Execute 'setup' or 'loop' once with fresh sensor readings."""
        self.io, self.serial, self.steps, self.local = io, [], 0, {}
        self.in_fn = True
        try: self.exec(self.fns[fn])
        finally: self.in_fn = False
        return self.serial

    def exec(self, n):
        self.steps += 1
        if self.steps > MAX_STEPS: raise CodeError("Program ran too long (infinite loop?)")
        t = n[0]
        if t == "block": [self.exec(s) for s in n[1]]
        elif t == "decl":  # globals are declared at start-up (in_fn False), locals inside functions
            (self.local if self.in_fn else self.vars)[n[1]] = self.ev(n[2]) if n[2] else 0
        elif t == "if":
            if self.ev(n[1]): self.exec(n[2])
            elif n[3]: self.exec(n[3])
        elif t == "assign":
            _, name, op, val, ln = n
            store = self.local if name in self.local else self.vars if name in self.vars else None
            if store is None: raise CodeError(f"'{name}' was not declared", ln)
            v = self.ev(val)
            store[name] = v if op == "=" else self.arith(op, store[name], v, ln)
        elif t == "expr": self.ev(n[1])

    def arith(self, op, a, b, ln):
        if op in "/%" and b == 0: raise CodeError("Division by zero", ln)
        if op == "+": return a + b
        if op == "-": return a - b
        if op == "*": return a * b
        if op == "/": return int(a / b) if isinstance(a, int) and isinstance(b, int) else a / b
        return a % b

    def ev(self, n):
        self.steps += 1
        t = n[0]
        if t in ("num", "str"): return n[1]
        if t == "var":
            if n[1] in self.local: return self.local[n[1]]
            if n[1] in self.vars: return self.vars[n[1]]
            if n[1] in CONSTS: return CONSTS[n[1]]
            raise CodeError(f"'{n[1]}' was not declared", n[2])
        if t == "un": v = self.ev(n[2]); return int(not v) if n[1] == "!" else -v
        if t == "call": return self._call(n[1], [self.ev(a) for a in n[2]], n[3])
        _, op, l, r, ln = n
        if op == "&&": return int(bool(self.ev(l)) and bool(self.ev(r)))  # short-circuit
        if op == "||": return int(bool(self.ev(l)) or bool(self.ev(r)))
        a, b = self.ev(l), self.ev(r)
        cmp = {"==": a == b, "!=": a != b, "<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b} if op in ("==", "!=", "<", "<=", ">", ">=") else None
        return int(cmp[op]) if cmp else self.arith(op, a, b, ln)

    def _call(self, f, a, ln):
        """WHITELIST of functions available to student code. Add new ones here."""
        try:
            if f == "pinMode": self.modes[a[0]] = a[1]
            elif f == "digitalWrite": self.outputs[a[0]] = 1 if a[1] else 0
            elif f == "analogWrite": self.outputs[a[0]] = 1 if a[1] > 0 else 0
            elif f == "digitalRead": return int(self.io["digital"].get(a[0], 0))
            elif f == "analogRead": return int(self.io["analog"].get(a[0] - 14 if a[0] >= 14 else a[0], 0))
            elif f == "map": return int((a[0] - a[1]) * (a[4] - a[3]) / (a[2] - a[1]) + a[3])
            elif f == "constrain": return max(a[1], min(a[2], a[0]))
            elif f in ("min", "max", "abs"): return {"min": min, "max": max, "abs": abs}[f](*a)
            elif f in ("delay", "delayMicroseconds", "Serial.begin"): pass  # time is simulated per tick
            elif f in ("Serial.print", "Serial.println"):
                txt = a[0] if a and isinstance(a[0], str) else (f"{a[0]:g}" if a and isinstance(a[0], float) else str(a[0]) if a else "")
                self.buf += txt
                if f.endswith("ln"): self.serial.append(self.buf); self.buf = ""
            else: raise CodeError(f"Unknown function '{f}'", ln)
        except (IndexError, TypeError):
            raise CodeError(f"Wrong arguments for '{f}'", ln)
        except ZeroDivisionError:
            raise CodeError("Division by zero in map()", ln)
        return 0
