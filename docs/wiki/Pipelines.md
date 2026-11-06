# Pipelines

A pipeline is the list of stages a deal moves through. Admins set them up under **Pipelines** in the sidebar (it needs
the `settings:manage` permission, which only admins have). Everyone who can read deals sees the result on the
[[Deals]] list, board and forms.

## The page

Choose a pipeline at the top. Beside it are **Rename**, **Make default** and **Delete**, a **Default** badge on the
default pipeline and how many deals it holds. Underneath, its stages are listed in order, each with its type, its
probability and how many deals are in it, and buttons to move it up or down, edit it or delete it. **Add stage** and
**New pipeline** are at the top of their sections.

## Pipelines

- **New pipeline** starts with the standard stages (Qualification 10%, Proposal 40%, Negotiation 70%, Closed won,
  Closed lost), which you then change to suit. Names must be different, whatever the letter case.
- **Default**: new deals (and the dashboard's quick *Add deal*) start in the first stage of the default pipeline. Make
  another pipeline the default with **Make default**; there is always exactly one.
- **Delete** removes a pipeline and its stages. It is refused for the default pipeline (make another the default
  first) and for a pipeline that still has deals.

## Stages

| Setting | Notes |
| --- | --- |
| Name | Required, up to 100 characters, different from the pipeline's other stages |
| Type | **Open**, **Won** or **Lost**. Deals in a won or lost stage are closed |
| Probability | 0 to 100: what a deal starts with when it moves into the stage. Won is always 100 and lost always 0 |
| Order | Move a stage up or down with the arrows |

Rules that keep the pipeline working:

- **The first stage must be open.** New deals start there, so it cannot be won or lost, and no move that would put a
  closed stage first is allowed.
- **A pipeline always has at least one stage.**
- **New open stages go before the closed ones** at the end, and new won or lost stages go last. Move them afterwards if
  you want them elsewhere.

### What happens to the deals in a stage

- **Changing a stage's type updates its deals.** Making a stage *won* or *lost* closes the deals in it (a deal that had
  already closed keeps its closing date) and sets their probability to 100% or 0%; making it *open* again reopens them
  and gives them the stage's probability. A stage reopened without a probability gets 50%.
- **Changing a stage's probability does not touch existing deals.** They keep their own, which you can still edit; only
  deals that move into the stage later take the new figure.
- **Deleting a stage that holds deals** asks where to move them. They become open, won or lost to match that stage, with
  its probability. An empty stage is deleted straight away, and the others are renumbered.

Every change is written to the audit log.

## Not here yet

A deal always stays in its own pipeline: there is no way to move a deal from one pipeline to another yet.
