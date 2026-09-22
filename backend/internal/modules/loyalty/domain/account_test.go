package domain

import "testing"

func TestApplyRedeemRatioAndCap(t *testing.T) {
	applied, discount, err := ApplyRedeem(20, 1000, 100)
	if err != nil || applied != 20 || discount != 200 {
		t.Fatalf("got %d %d %v", applied, discount, err)
	}
	if MaxDiscountRupiah(1000) != 200 || MaxRedeemablePoints(1000) != 20 {
		t.Fatal("cap")
	}
	if _, _, err := ApplyRedeem(21, 1000, 100); err != ErrRedemptionLimit {
		t.Fatalf("cap err %v", err)
	}
	if _, _, err := ApplyRedeem(10, 1000, 9); err != ErrInsufficient {
		t.Fatalf("avail err %v", err)
	}
	if a, d, err := ApplyRedeem(0, 1000, 0); err != nil || a != 0 || d != 0 {
		t.Fatal(err)
	}
	if MaxDiscountRupiah(9) != 1 || MaxRedeemablePoints(9) != 0 {
		t.Fatal("small subtotal")
	}
	if AvailablePoints(100, 40, 10) != 50 {
		t.Fatal("available")
	}
	if AvailablePoints(10, 20, 0) != 0 {
		t.Fatal("floor")
	}
}

func TestApplyRedeemNoFloat(t *testing.T) {
	if MaxDiscountRupiah(11) != 2 {
		t.Fatal("integer floor")
	}
}
