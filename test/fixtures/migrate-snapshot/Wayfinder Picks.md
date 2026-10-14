# Section

text — text
text [[Wayfinder Config]])

text · text · text [[Wayfinder Dashboard]]
text [[Wayfinder Efforts]]
text [[Wayfinder Effort Tickets]]

---

## Section

text [[Wayfinder Dashboard]] text — text

text

- text = text — text
- text — ticket text
- text — text

> text [[Wayfinder Effort Tickets]] — text
> text
> text · text
> text

```dataview
TABLE WITHOUT ID
  file.link AS "Ticket",
  type AS "Type",
code
FROM "" AND -"_tools"
WHERE status = "open"
  AND link(repo + "/" + effort + "/map").status = "active"
  AND all(map(blockers, (b) => b.status = "resolved"))
SORT file.name ASC
```

> text — text
> text
> text type = text
