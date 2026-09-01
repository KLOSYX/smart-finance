"""Read-only reconciliation; asset changes alone cannot identify consumption."""

from datetime import date, timedelta

from sqlalchemy.orm import Session, joinedload

from app.models.transaction import Asset, AssetSnapshot, Cashflow


def monthly_reconciliation(db: Session, start: date, end: date, today: date) -> dict:
    opening_date = start - timedelta(days=1)
    closing_date = min(end - timedelta(days=1), today)
    assets = (
        db.query(Asset)
        .options(joinedload(Asset.category), joinedload(Asset.snapshots))
        .filter(Asset.is_archived.is_(False))
        .all()
    )
    details = []
    for asset in assets:
        snapshots = sorted(
            (s for s in asset.snapshots if s.valuation_date <= closing_date),
            key=lambda s: (s.valuation_date, s.id),
        )
        # Assets first recorded after this period are outside its known scope.
        if not snapshots:
            continue
        opening = next(
            (s for s in reversed(snapshots) if s.valuation_date <= opening_date),
            None,
        )
        closing: AssetSnapshot = snapshots[-1]
        issues = []
        if opening is None:
            issues.append("missing_opening")
        elif opening.valuation_date != opening_date:
            issues.append("stale_opening")
        if closing.valuation_date < start:
            issues.append("missing_closing_update")
        elif closing.valuation_date != closing_date:
            issues.append("stale_closing")
        details.append(
            {
                "asset_id": asset.id,
                "name": asset.name,
                "category": asset.category.name,
                "channel": asset.channel,
                "opening_date": opening.valuation_date if opening else None,
                "closing_date": closing.valuation_date,
                "opening_cents": opening.value_cents if opening else None,
                "closing_cents": closing.value_cents,
                "change_cents": closing.value_cents - opening.value_cents
                if opening
                else None,
                "issues": issues,
            }
        )
    rows = (
        db.query(Cashflow)
        .filter(
            Cashflow.transaction_date >= start,
            Cashflow.transaction_date <= closing_date,
        )
        .all()
    )
    income = sum(r.amount_cents for r in rows if r.flow_type == "income")
    expense = sum(r.amount_cents for r in rows if r.flow_type == "expense")
    refunds = sum(r.amount_cents for r in rows if r.flow_type == "expense_refund")
    recorded = expense - refunds  # Preserve negative net expense across refund months.
    missing = sum("missing_opening" in item["issues"] for item in details)
    ready = sum(not item["issues"] for item in details)
    can_estimate = bool(details) and not missing and start <= today
    opening_total = (
        sum(item["opening_cents"] or 0 for item in details) if can_estimate else None
    )
    closing_total = sum(item["closing_cents"] for item in details) if details else None
    inferred = opening_total + income - closing_total if can_estimate else None
    status = (
        "unavailable"
        if not can_estimate
        else "estimated"
        if ready != len(details) or closing_date < end - timedelta(days=1)
        else "snapshots_ready"
    )
    return {
        "month": start.strftime("%Y-%m"),
        "opening_date": opening_date,
        "closing_date": closing_date,
        "status": status,
        "is_partial_month": closing_date < end - timedelta(days=1),
        "opening_assets_cents": opening_total,
        "closing_assets_cents": closing_total,
        "asset_change_cents": closing_total - opening_total if can_estimate else None,
        "income_cents": income,
        "gross_expense_cents": expense,
        "refund_cents": refunds,
        "recorded_expense_cents": recorded,
        "inferred_expense_cents": inferred,
        "gap_cents": inferred - recorded if inferred is not None else None,
        "record_count": len(rows),
        "asset_count": len(details),
        "ready_asset_count": ready,
        "missing_opening_count": missing,
        "assets": sorted(
            details, key=lambda item: abs(item["change_cents"] or 0), reverse=True
        ),
    }
