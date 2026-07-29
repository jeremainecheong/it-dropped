package database

import "testing"

// The dashboard offers the transaction pooler first, so the failure this
// guards against — "prepared statement already exists" on the second query —
// is the default path, not an unusual one.
func TestTransactionPoolerDetection(t *testing.T) {
	cases := []struct {
		name string
		conn string
		want bool
	}{
		{"supabase transaction pooler", "postgresql://u:p@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres", true},
		{"supabase session pooler", "postgresql://u:p@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres", false},
		{"direct connection", "postgresql://u:p@db.abcd.supabase.co:5432/postgres", false},
		{"explicit pgbouncer flag", "postgresql://u:p@host:5432/postgres?pgbouncer=true", true},
		{"local dev", "postgres://postgres@127.0.0.1:5433/postgres?sslmode=disable", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := usesTransactionPooler(tc.conn); got != tc.want {
				t.Errorf("usesTransactionPooler(%q) = %v, want %v", tc.conn, got, tc.want)
			}
		})
	}
}
