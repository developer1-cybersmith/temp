"""Catalog queries behind T1 (doc 03 s9, ADR 0016). Each returns a list of violations."""

from typing import Any

from psycopg import Connection

from tests.db.expectations import (
    DEFINER_ALLOW,
    LOGIN_ROLES_ZERO_GRANTS,
    NO_BYPASS_ROLES,
    NO_TENANT_ID_COLUMN,
    SIMPLE_FK_PARENTS,
)

RLS_SCHEMAS = ["app", "langgraph", "private"]
SCAN_SCHEMAS = ["app", "langgraph", "private", "public"]
REL_KINDS = "('r','p')"
ANON_PRIVS = "SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER"


def _q(c: Connection[Any], query: str, params: Any = None) -> list[tuple[Any, ...]]:
    return c.execute(query, params).fetchall()  # type: ignore[call-overload,no-any-return]


def tables(c: Connection[Any], schemas: list[str] = RLS_SCHEMAS) -> list[str]:
    rows = _q(
        c,
        f"select n.nspname || '.' || c.relname from pg_class c"
        f" join pg_namespace n on n.oid = c.relnamespace"
        f" where n.nspname = any(%s) and c.relkind in {REL_KINDS} and not c.relispartition"
        f" order by 1",
        (schemas,),
    )
    return [r[0] for r in rows]


def tenant_tables(c: Connection[Any]) -> list[tuple[str, str]]:
    """(table, tenant column) for every app table scoped to a tenant (tenants uses id)."""
    out = []
    for t in tables(c, ["app"]):
        if t == "app.tenants":
            out.append((t, "id"))
        elif t not in NO_TENANT_ID_COLUMN and _has_col(c, t, "tenant_id"):
            out.append((t, "tenant_id"))
    return out


def _has_col(c: Connection[Any], table: str, col: str) -> bool:
    return bool(
        _q(
            c,
            "select 1 from pg_attribute where attrelid = %s::regclass and attname = %s"
            " and not attisdropped",
            (table, col),
        )
    )


def rls_not_enabled_or_forced(c: Connection[Any]) -> list[str]:
    rows = _q(
        c,
        f"select n.nspname || '.' || c.relname, c.relrowsecurity, c.relforcerowsecurity"
        f" from pg_class c join pg_namespace n on n.oid = c.relnamespace"
        f" where n.nspname = any(%s) and c.relkind in {REL_KINDS} and not c.relispartition",
        (RLS_SCHEMAS,),
    )
    out = []
    for name, enabled, forced in rows:
        if not enabled:
            out.append(f"{name}: RLS not enabled")
        elif not forced:
            out.append(f"{name}: RLS not forced")
    return out


def policy_problems(c: Connection[Any]) -> list[str]:
    """At least one policy; one set per role; TO a role (not PUBLIC); UPDATE has WITH CHECK."""
    out = []
    for t in tables(c):
        n = _q(c, "select count(*) from pg_policy where polrelid = %s::regclass", (t,))[0][0]
        if n == 0:
            out.append(f"{t}: no policy")
    rows = _q(
        c,
        "select p.polrelid::regclass::text, p.polname, p.polcmd, p.polroles::oid[],"
        " pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid),"
        " (select array_agg(rolname) from pg_roles where oid = any(p.polroles))"
        " from pg_policy p join pg_class c on c.oid = p.polrelid"
        " join pg_namespace n on n.oid = c.relnamespace where n.nspname = any(%s)",
        (RLS_SCHEMAS,),
    )
    for rel, name, cmd, oids, qual, check, roles in rows:
        label = f"{rel}.{name}"
        roles = roles or []
        if 0 in oids:
            out.append(f"{label}: policy applies to PUBLIC")
        if "authenticated" in roles and "worker_role" in roles:
            out.append(f"{label}: one policy for both authenticated and worker_role")
        if cmd == "w" and check is None:
            out.append(f"{label}: UPDATE policy without WITH CHECK")
        text = f"{qual or ''} {check or ''}"
        if "user_metadata" in text or "auth.role()" in text:
            out.append(f"{label}: uses user_metadata or auth.role()")
    return out


def missing_tenant_id(c: Connection[Any]) -> list[str]:
    out = []
    for t in tables(c, ["app"]):
        if t not in NO_TENANT_ID_COLUMN and not _has_col(c, t, "tenant_id"):
            out.append(f"{t}: no tenant_id column")
    return out


def tenant_id_not_first_in_an_index(c: Connection[Any]) -> list[str]:
    out = []
    for t, col in tenant_tables(c):
        if col != "tenant_id":
            continue
        ok = _q(
            c,
            "select 1 from pg_index i where i.indrelid = %s::regclass and i.indkey[0] = ("
            "select attnum from pg_attribute where attrelid = i.indrelid"
            " and attname = 'tenant_id')",
            (t,),
        )
        if not ok:
            out.append(f"{t}: tenant_id is not the first column of any index")
    return out


def non_composite_foreign_keys(c: Connection[Any]) -> list[str]:
    rows = _q(
        c,
        "select con.conrelid::regclass::text, con.conname, con.confrelid::regclass::text,"
        " array(select a.attname from unnest(con.conkey) with ordinality k(n, i)"
        "   join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.i),"
        " array(select a.attname from unnest(con.confkey) with ordinality k(n, i)"
        "   join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.i)"
        " from pg_constraint con join pg_class c on c.oid = con.conrelid"
        " join pg_namespace n on n.oid = c.relnamespace"
        " where con.contype = 'f' and n.nspname = 'app'",
    )
    out = []
    for child, name, parent, cols, refcols in rows:
        if not _has_col(c, child, "tenant_id"):
            continue
        if parent in SIMPLE_FK_PARENTS:
            continue
        if not _has_col(c, parent, "tenant_id"):
            out.append(f"{child}.{name}: references {parent}, which has no tenant_id")
        elif "tenant_id" not in cols or "tenant_id" not in refcols:
            out.append(f"{child}.{name}: FK to {parent} is not composite on tenant_id")
        elif cols.index("tenant_id") != refcols.index("tenant_id"):
            out.append(f"{child}.{name}: tenant_id columns do not line up with {parent}")
    return out


def anon_or_public_grants(c: Connection[Any]) -> list[str]:
    out = []
    for s in ("app", "langgraph", "private"):
        rows = _q(c, "select 1 from pg_namespace where nspname = %s", (s,))
        if rows and _q(c, "select has_schema_privilege('anon', %s, 'USAGE')", (s,))[0][0]:
            out.append(f"schema {s}: anon (or PUBLIC) has USAGE")
    rows = _q(
        c,
        "select n.nspname || '.' || c.relname, c.relkind from pg_class c"
        " join pg_namespace n on n.oid = c.relnamespace"
        " where n.nspname = any(%s) and c.relkind in ('r','p','v','m','f','S')",
        (SCAN_SCHEMAS,),
    )
    for name, kind in rows:
        if kind == "S":
            bad = _q(c, "select has_sequence_privilege('anon', %s, 'USAGE,SELECT,UPDATE')", (name,))
        else:
            bad = _q(c, "select has_table_privilege('anon', %s, %s)", (name, ANON_PRIVS))
        if bad[0][0]:
            out.append(f"{name}: anon (or PUBLIC) has privileges")
    return out


def public_schema_objects(c: Connection[Any]) -> list[str]:
    rows = _q(
        c,
        "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace"
        " where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')"
        " and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')",
    )
    return [f"public.{r[0]}: public must hold no tables or views" for r in rows]


def definer_function_problems(c: Connection[Any]) -> list[str]:
    rows = _q(
        c,
        "select n.nspname || '.' || p.proname, p.proname,"
        " exists (select 1 from unnest(coalesce(p.proconfig, '{}')) x"
        " where x like 'search_path=%%'),"
        " has_function_privilege('anon', p.oid, 'EXECUTE')"
        " from pg_proc p join pg_namespace n on n.oid = p.pronamespace"
        " where p.prosecdef and n.nspname = any(%s)",
        (SCAN_SCHEMAS,),
    )
    out = []
    for full, name, pinned, anon_exec in rows:
        listed = name in DEFINER_ALLOW or any(
            a.endswith("*") and name.startswith(a[:-1]) for a in DEFINER_ALLOW
        )
        if not listed:
            out.append(f"{full}: SECURITY DEFINER but not on the allow-list")
        if not pinned:
            out.append(f"{full}: search_path not pinned")
        if anon_exec:
            out.append(f"{full}: EXECUTE open to anon or PUBLIC")
    return out


def view_problems(c: Connection[Any]) -> list[str]:
    rows = _q(
        c,
        "select n.nspname || '.' || c.relname, c.relkind,"
        " coalesce(c.reloptions, '{}') && array['security_invoker=true','security_invoker=on']"
        " from pg_class c join pg_namespace n on n.oid = c.relnamespace"
        " where n.nspname = any(%s) and c.relkind in ('v','m')",
        (SCAN_SCHEMAS,),
    )
    out = []
    for name, kind, invoker in rows:
        if kind == "m":
            out.append(f"{name}: materialized views bypass RLS")
        elif not invoker:
            out.append(f"{name}: view is not security_invoker")
    return out


def login_role_grants(c: Connection[Any]) -> list[str]:
    out = []
    rels = _q(
        c,
        "select n.nspname || '.' || c.relname from pg_class c"
        " join pg_namespace n on n.oid = c.relnamespace"
        " where n.nspname = any(%s) and c.relkind in ('r','p','v','m','f')",
        (SCAN_SCHEMAS,),
    )
    for role in LOGIN_ROLES_ZERO_GRANTS:
        for (rel,) in rels:
            if _q(c, "select has_table_privilege(%s, %s, %s)", (role, rel, ANON_PRIVS))[0][0]:
                out.append(f"{role}: has privileges on {rel} (must have zero base grants)")
    return out


def role_attribute_problems(c: Connection[Any]) -> list[str]:
    rows = _q(
        c,
        "select rolname, rolsuper, rolbypassrls from pg_roles where rolname = any(%s)",
        (NO_BYPASS_ROLES,),
    )
    return [f"{n}: superuser or BYPASSRLS" for n, sup, byp in rows if sup or byp]


def extension_schema_problems(c: Connection[Any]) -> list[str]:
    rows = _q(
        c,
        "select e.extname, n.nspname from pg_extension e join pg_namespace n"
        " on n.oid = e.extnamespace where e.extname in ('vector','btree_gist','pg_trgm')",
    )
    return [f"extension {e} is in {s}, expected extensions" for e, s in rows if s != "extensions"]
