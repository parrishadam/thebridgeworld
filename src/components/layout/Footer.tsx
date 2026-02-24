import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-white mt-16">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <h3 className="font-serif text-lg font-bold mb-3">The Bridge World</h3>
            <p className="text-sm text-stone-500 leading-relaxed">
              The definitive digital magazine for bridge players worldwide.
            </p>
          </div>
          <div>
            <h4 className="font-sans text-xs uppercase tracking-wider text-stone-500 mb-3">
              Categories
            </h4>
            <ul className="space-y-2 text-sm text-stone-600">
              {["Bidding", "Play", "Defence", "Conventions", "Tournaments"].map((cat) => (
                <li key={cat}>
                  <Link
                    href={`/articles?category=${cat.toLowerCase()}`}
                    className="hover:text-stone-900 transition-colors"
                  >
                    {cat}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-sans text-xs uppercase tracking-wider text-stone-500 mb-3">
              Publication
            </h4>
            <ul className="space-y-2 text-sm text-stone-600">
              <li><Link href="/issues" className="hover:text-stone-900 transition-colors">All Issues</Link></li>
              <li><Link href="/about" className="hover:text-stone-900 transition-colors">About</Link></li>
              <li><Link href="/faq" className="hover:text-stone-900 transition-colors">FAQ</Link></li>
              <li><Link href="/contact" className="hover:text-stone-900 transition-colors">Contact</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-stone-100 pt-6 text-center text-xs text-stone-400">
          &copy; {new Date().getFullYear()} The Bridge World. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
