package db

import (
	"context"

	"github.com/jackc/pgx/v5"
)

type txKey struct{}

func WithTx(ctx context.Context, tx pgx.Tx) context.Context {
	return context.WithValue(ctx, txKey{}, tx)
}

func TxFrom(ctx context.Context) pgx.Tx {
	tx, _ := ctx.Value(txKey{}).(pgx.Tx)
	return tx
}

func (p *Pool) InTx(ctx context.Context, fn func(context.Context) error) error {
	if p == nil || p.inner == nil {
		return fn(ctx)
	}
	tx, err := p.inner.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(WithTx(ctx, tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (p *Pool) InSerializableTx(ctx context.Context, fn func(context.Context) error) error {
	if p == nil || p.inner == nil {
		return fn(ctx)
	}
	tx, err := p.inner.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(WithTx(ctx, tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (p *Pool) InRepeatableReadTx(ctx context.Context, fn func(context.Context) error) error {
	if p == nil || p.inner == nil {
		return fn(ctx)
	}
	tx, err := p.inner.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(WithTx(ctx, tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
