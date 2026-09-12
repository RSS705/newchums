"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { AppCard } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

type Person = { id: string; name: string | null; username: string | null; email: string | null };

type KudosRow = {
  id: string;
  tag: string;
  label: string;
  emoji: string;
  retired: boolean;
  createdAt: string;
  hiddenByRecipient: boolean;
  plan: { id: string | null; title: string | null; startsAt: string | null };
  giver: Person;
  recipient: Person;
};

const PAGE_SIZE = 100;

function personCell(p: Person) {
  const label = p.name?.trim() || p.username || p.email || "Unknown";
  return (
    <Stack spacing={0} sx={{ minWidth: 0 }}>
      {p.username ? (
        <Typography
          component={Link}
          href={`/u/${p.username.replace(/^@/, "")}`}
          variant="body2"
          sx={{ fontWeight: 600, color: "primary.dark", textDecoration: "none", wordBreak: "break-word", "&:hover": { textDecoration: "underline" } }}
        >
          {label}
        </Typography>
      ) : (
        <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: "break-word" }}>{label}</Typography>
      )}
      <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.6875rem", wordBreak: "break-all" }}>
        {p.username ? `@${p.username.replace(/^@/, "")}` : p.email}
      </Typography>
    </Stack>
  );
}

/** Super-admin view of every tag ever given: who gave it, who got it, on
 *  which plan, newest first. Tags are anonymous to users everywhere else in
 *  the product, so this page is deliberately the only place a giver is
 *  named. */
export default function AdminKudosClient() {
  const [rows, setRows] = useState<KudosRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  /** Pure fetch: no state writes, so every caller decides what to do with
   *  the result after the await. Keeps the mount effect free of synchronous
   *  setState, which the React Compiler lint rejects. */
  const fetchPage = useCallback(async (nextOffset: number, q: string) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(nextOffset) });
    if (q) params.set("q", q);
    try {
      const res = await apiFetch(`/admin/kudos?${params.toString()}`, { auth: true });
      const data = (await res.json()) as { ok?: boolean; items?: KudosRow[]; total?: number; hasMore?: boolean };
      return data.ok && Array.isArray(data.items) ? data : null;
    } catch {
      return null;
    }
  }, []);

  // First page, and again whenever the search term changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchPage(0, query);
      if (cancelled) return;
      if (data) {
        setRows(data.items!);
        setTotal(data.total ?? 0);
        setHasMore(data.hasMore === true);
        setOffset(0);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchPage, query]);

  const loadMore = async () => {
    setLoading(true);
    const nextOffset = offset + PAGE_SIZE;
    const data = await fetchPage(nextOffset, query);
    if (data) {
      setRows((prev) => [...prev, ...data.items!]);
      setTotal(data.total ?? 0);
      setHasMore(data.hasMore === true);
      setOffset(nextOffset);
    }
    setLoading(false);
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" sx={{ fontSize: { xs: "1.75rem", sm: "2.125rem" }, fontWeight: 700, lineHeight: 1.15 }}>
          Tags Given
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.6, maxWidth: 680 }}>
          Every tag anyone has given, newest first. Tags are anonymous to members, so this is the only place the giver is named. {total} {query ? "matching" : "in total"}.
        </Typography>
      </Box>

      <AppCard>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "stretch", sm: "center" }}>
          <TextField
            size="small"
            fullWidth
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setLoading(true); setQuery(search.trim()); } }}
            placeholder="Search by person, plan, or tag"
            sx={{ maxWidth: { sm: 420 } }}
          />
          <Button variant="outlined" onClick={() => { setLoading(true); setQuery(search.trim()); }} sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}>
            Search
          </Button>
          {query && (
            <Button variant="text" onClick={() => { setLoading(true); setSearch(""); setQuery(""); }} sx={{ textTransform: "none", fontWeight: 600, color: "text.secondary" }}>
              Clear
            </Button>
          )}
        </Stack>
      </AppCard>

      <AppCard sx={{ p: 0, overflow: "hidden" }}>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: { xs: 0, md: 760 } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, px: { xs: 1, sm: 2 } }}>Given</TableCell>
                <TableCell sx={{ fontWeight: 700, px: { xs: 1, sm: 2 } }}>Tag</TableCell>
                <TableCell sx={{ fontWeight: 700, px: { xs: 1, sm: 2 } }}>From</TableCell>
                <TableCell sx={{ fontWeight: 700, px: { xs: 1, sm: 2 } }}>To</TableCell>
                <TableCell sx={{ fontWeight: 700, display: { xs: "none", md: "table-cell" } }}>Plan</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={{ whiteSpace: "nowrap", px: { xs: 1, sm: 2 } }}>
                    <Typography variant="body2">{new Date(r.createdAt).toLocaleDateString()}</Typography>
                    <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.6875rem" }}>
                      {new Date(r.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ px: { xs: 1, sm: 2 } }}>
                    <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {r.emoji} {r.label}
                      </Typography>
                      {r.retired && <Chip label="Retired" size="small" variant="outlined" sx={{ height: 18, fontSize: "0.625rem" }} />}
                      {r.hiddenByRecipient && (
                        <Chip label="Hidden by them" size="small" variant="outlined" sx={{ height: 18, fontSize: "0.625rem" }} />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ px: { xs: 1, sm: 2 } }}>{personCell(r.giver)}</TableCell>
                  <TableCell sx={{ px: { xs: 1, sm: 2 } }}>{personCell(r.recipient)}</TableCell>
                  <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                    {r.plan.id ? (
                      <Typography
                        component={Link}
                        href={`/events/${r.plan.id}`}
                        variant="body2"
                        sx={{ color: "primary.dark", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                      >
                        {r.plan.title || "Untitled plan"}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.disabled">Plan deleted</Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                      {query ? "No tags match that search." : "No tags have been given yet."}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </AppCard>

      {hasMore && (
        <Box sx={{ textAlign: "center" }}>
          <Button
            variant="outlined"
            disabled={loading}
            onClick={loadMore}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
          >
            {loading ? "Loading…" : "Load more"}
          </Button>
        </Box>
      )}
    </Stack>
  );
}
