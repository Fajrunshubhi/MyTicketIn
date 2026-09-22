package application

import (
	"golang.org/x/crypto/bcrypt"
)

type Hasher interface {
	Hash(password string) (string, error)
	Compare(hash, password string) bool
}

type BcryptHasher struct {
	Cost int
}

func NewBcryptHasher(cost int) BcryptHasher {
	if cost < bcrypt.MinCost {
		cost = 12
	}
	return BcryptHasher{Cost: cost}
}

func (h BcryptHasher) Hash(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), h.Cost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (h BcryptHasher) Compare(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

type StaticHasher struct {
	HashFn    func(string) (string, error)
	CompareFn func(hash, password string) bool
}

func (s StaticHasher) Hash(password string) (string, error) { return s.HashFn(password) }
func (s StaticHasher) Compare(hash, password string) bool   { return s.CompareFn(hash, password) }
