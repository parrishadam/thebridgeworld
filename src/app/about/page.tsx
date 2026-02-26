import { Metadata } from "next";
import Image from "next/image";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "About — The Bridge World",
  description:
    "The history of The Bridge World, the oldest continuously published contract bridge magazine, founded in 1929 by Ely Culbertson.",
};

export default function AboutPage() {
  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="text-4xl sm:text-5xl font-serif font-bold tracking-tight text-gray-900 mb-2">
        About <em>The&nbsp;Bridge&nbsp;World</em>
      </h1>
      <p className="text-lg text-gray-500 mb-10">
        The world&rsquo;s oldest continuously published bridge magazine
      </p>

      <div className="prose prose-lg prose-gray max-w-none">
        <section>
          <h2 className="text-2xl font-serif font-extrabold text-gray-900 mb-4">Founded in 1929</h2>
          <figure className="not-prose w-full md:float-right md:ml-6 mb-4 md:w-[280px]">
            <Image
              src="/images/about/first-issue-1929.jpg"
              alt="Advertisement from the first issue of The Bridge World, October 1929"
              width={280}
              height={400}
              className="w-full rounded-lg shadow-md border border-stone-200"
            />
            <figcaption className="text-sm text-gray-500 mt-2">
              From the first issue, October 1929
            </figcaption>
          </figure>
          <p>
            <em>The Bridge World</em> was founded in 1929 by Ely Culbertson in
            the earliest days of contract bridge. From its very first issue the
            magazine set out to be the game&rsquo;s principal journal&mdash;publicizing
            advances in bidding and play, sparking debates on ethics and
            propriety, reporting on major tournaments, and profiling the
            leading personalities of the bridge world.
          </p>
          <p>
            For over nine decades it has fulfilled that mission. Virtually every
            important bridge analyst in the history of the game has contributed
            to its pages, and nearly every significant development in bidding
            theory, card play, and competitive strategy first appeared here.
          </p>
          <figure className="not-prose w-[180px] mt-6 mb-2">
            <Image
              src="/images/about/ely-culbertson.jpg"
              alt="Portrait of Ely Culbertson"
              width={180}
              height={240}
              className="w-full rounded-lg shadow-md"
            />
            <figcaption className="text-sm text-gray-500 mt-2">
              Ely Culbertson, founder (1929–1943)
            </figcaption>
          </figure>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-serif font-extrabold text-gray-900 mb-4">A Line of Distinguished Editors</h2>
          <p>
            Culbertson edited the magazine from its founding through 1943,
            assisted by a remarkable staff that included Josephine Culbertson,
            Alfred Sheinwold, Samuel Fry&nbsp;Jr., Richard&nbsp;L.&nbsp;Frey,
            Albert&nbsp;H.&nbsp;Morehead, and Alphonse &ldquo;Sonny&rdquo;
            Moyse&nbsp;Jr.
          </p>
          <p>
            Morehead succeeded Culbertson and served as editor until 1946, when
            Moyse took over. In 1963 the McCall Corporation purchased the
            magazine, and subsequently sold it to Edgar Kaplan. Kaplan became
            editor and publisher in late 1966, beginning with the January 1967
            issue. Jeff Rubens served as Kaplan&rsquo;s co-editor for three
            decades until Kaplan&rsquo;s death in 1997, at which point Rubens
            became editor and publisher&mdash;a role he has held ever since.
          </p>
          <p>
            Today, Adam Parrish serves as editor-in-chief, guiding the
            magazine into its digital era while preserving the editorial
            standards and depth of analysis that have defined{" "}
            <em>The Bridge World</em> for nearly a century.
          </p>
          <div className="not-prose flex flex-col sm:flex-row gap-6 mt-6">
            <figure className="w-[200px]">
              <Image
                src="/images/about/edgar-kaplan.jpeg"
                alt="Portrait of Edgar Kaplan"
                width={200}
                height={260}
                className="w-full rounded-lg shadow-md"
              />
              <figcaption className="text-sm text-gray-500 mt-2">
                Edgar Kaplan, editor and publisher (1967–1997)
              </figcaption>
            </figure>
            <figure className="w-[200px]">
              <Image
                src="/images/about/jeff-rubens.jpeg"
                alt="Portrait of Jeff Rubens"
                width={200}
                height={260}
                className="w-full rounded-lg shadow-md"
              />
              <figcaption className="text-sm text-gray-500 mt-2">
                Jeff Rubens, editor and publisher (1997–2005)
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-serif font-extrabold text-gray-900 mb-4">The Master Solvers&rsquo; Club</h2>
          <p>
            The magazine&rsquo;s most celebrated feature is the Master
            Solvers&rsquo; Club (MSC), the longest-running bridge feature in
            the world. Each month a panel of top experts is presented with a
            set of bidding and play problems. The panelists&rsquo; answers and
            commentary are published alongside a detailed analysis by the
            director, and readers submit their own solutions in an annual
            competition. The emphasis is on discussion and judgment rather than
            rote answers&mdash;as one multi-time world champion once put it,
            &ldquo;I learned to bid by reading and rereading the Master
            Solvers&rsquo; Club.&rdquo;
          </p>
          <p>
            The MSC originated in the early 1930s, directed first by Samuel
            Fry&nbsp;Jr. and later, for two decades, by Albert&nbsp;H.&nbsp;Morehead,
            who shaped it into the most popular feature in bridge journalism.
            Under the Kaplan–Rubens editorship a rotating panel of directors
            was introduced, and the feature continues to evolve today.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-serif font-extrabold text-gray-900 mb-4">Bridge World Standard</h2>
          <p>
            Since 1968 the magazine has periodically polled experts on bidding
            treatments and conventions to develop{" "}
            <strong>Bridge World Standard</strong> (BWS)&mdash;a consensus
            bidding system that reflects prevailing expert practice. BWS serves
            as the assumed system for MSC problems and as a practical framework
            for any two experienced players who sit down together without prior
            discussion. The system has been revised five times, most recently
            in 2017.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-serif font-extrabold text-gray-900 mb-4">Signature Features</h2>
          <p>
            Beyond the MSC, the magazine has introduced and sustained a
            number of landmark features over the years:
          </p>
          <ul>
            <li>
              <strong>Challenge the Champs</strong> &mdash; a monthly bidding
              contest in which leading pairs compete on deals from actual play.
            </li>
            <li>
              <strong>Fifty Years Ago</strong> &mdash; a column, introduced in
              1986, that revisits an issue from exactly half a century earlier
              and examines its topics in the light of subsequent bridge history.
            </li>
            <li>
              <strong>Swiss Match</strong> &mdash; a set of bidding and play
              problems scored as though across a Swiss-team match.
            </li>
            <li>
              <strong>Bridge Hall of Fame</strong> &mdash; the original Hall of
              Fame was created by <em>The Bridge World</em> through a poll of
              bridge columnists in 1964, electing Ely Culbertson, Charles
              Goren, and Harold Vanderbilt as its first three members. The
              ACBL later adopted these inductees when it inaugurated its own
              Hall of Fame in 1995.
            </li>
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-serif font-extrabold text-gray-900 mb-4">Our Philosophy</h2>
          <p>
            <em>The Bridge World</em> is dedicated to helping readers
            understand the game more deeply and become smarter players. The
            emphasis has always been on developing sound bridge thinking&mdash;common
            sense, clear reasoning, and useful thought patterns&mdash;rather than
            memorization and rigid rules.
          </p>
          <p>
            The magazine is written for serious players of all levels, from
            advancing intermediates to seasoned experts, and covers every
            dimension of the game: bidding, declarer play, defense, partnership
            methods, tournament strategy, ethics, and the culture and history
            of bridge.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-serif font-extrabold text-gray-900 mb-4">The Digital Archive</h2>
          <p>
            This site is home to a growing digital archive of{" "}
            <em>Bridge World</em> content&mdash;both new original articles and
            digitized material from the magazine&rsquo;s back issues stretching
            back to 1929. Interactive features, including playable bridge
            hands, let you experience the deals as though you were at the
            table.
          </p>
          <p>
            We are continuously expanding the archive. If you have questions,
            corrections, or suggestions, we&rsquo;d love to hear from you.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-serif font-extrabold text-gray-900 mb-4">Our Mission</h2>
          <ul>
            <li>To help you become a better bridge player, and a better partner.</li>
            <li>To prepare you to succeed at the table and win more.</li>
            <li>To increase your understanding, appreciation and enjoyment of the game.</li>
            <li>To entertain you and to challenge you.</li>
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-serif font-extrabold text-gray-900 mb-4">Our Approach</h2>
          <p>
            <em>The Bridge World</em> is dedicated to helping you understand the
            game more thoroughly, and become a smarter player. Our focus is on
            teaching using common sense and useful thought patterns, as opposed
            to memorization and complex rules. We strive to improve your game by
            improving your &ldquo;bridge thinking&rdquo; and not through rote
            learning.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-serif font-extrabold text-gray-900 mb-4">Reader Testimonials</h2>
          <div className="not-prose space-y-6">
            <blockquote className="border-l-4 border-stone-300 pl-4">
              <p className="text-gray-700 italic">
                &ldquo;I learned how to bid by reading The Bridge World&rsquo;s
                Master Solvers&rsquo; Club.&rdquo;
              </p>
              <footer className="text-sm text-gray-500 mt-1">
                &mdash; Bobby Goldman, 5-time world champion
              </footer>
            </blockquote>
            <blockquote className="border-l-4 border-stone-300 pl-4">
              <p className="text-gray-700 italic">
                &ldquo;If bridge is the greatest addiction (and it is), then The
                Bridge World is my monthly fix&nbsp;&mdash; pure unadulterated
                pleasure in an irresistible read.&rdquo;
              </p>
              <footer className="text-sm text-gray-500 mt-1">
                &mdash; Zia, bridge superstar
              </footer>
            </blockquote>
            <blockquote className="border-l-4 border-stone-300 pl-4">
              <p className="text-gray-700 italic">
                &ldquo;Indispensable for anyone who wishes to stay current on
                the theory &amp; practice of tournament bridge.&rdquo;
              </p>
              <footer className="text-sm text-gray-500 mt-1">
                &mdash; John Swanson, bridge writer &amp; world champion
              </footer>
            </blockquote>
            <blockquote className="border-l-4 border-stone-300 pl-4">
              <p className="text-gray-700 italic">
                &ldquo;For me, The Bridge World is the best publication ever.
                It&rsquo;s a must read. Anybody interested in playing this
                beautiful game at a higher level should get on the subscription
                list, pronto.&rdquo;
              </p>
              <footer className="text-sm text-gray-500 mt-1">
                &mdash; Eddie Kantar, bridge champion
              </footer>
            </blockquote>
            <blockquote className="border-l-4 border-stone-300 pl-4">
              <p className="text-gray-700 italic">
                &ldquo;Reading my first Bridge World magazine in 1949 I was
                impressed with its sophistication and its presentation. It was
                the best then and continues to be the best now.&rdquo;
              </p>
              <footer className="text-sm text-gray-500 mt-1">
                &mdash; Bobby Wolff
              </footer>
            </blockquote>
            <blockquote className="border-l-4 border-stone-300 pl-4">
              <p className="text-gray-700 italic">
                &ldquo;Most top players would rate The Bridge World as the #1
                bridge magazine in the world.&rdquo;
              </p>
              <footer className="text-sm text-gray-500 mt-1">
                &mdash; Ron Klinger, author
              </footer>
            </blockquote>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-serif font-extrabold text-gray-900 mb-4">Cover Gallery</h2>
          <div className="not-prose grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {[
              { src: "/images/covers/193301-OFC.jpg", date: "January 1933" },
              { src: "/images/covers/193312-OFC.jpg", date: "December 1933" },
              { src: "/images/covers/193709-OFC.jpg", date: "September 1937" },
              { src: "/images/covers/194709-OFC.jpg", date: "September 1947" },
              { src: "/images/covers/196311-OFC.jpg", date: "November 1963" },
              { src: "/images/covers/196402-OFC.jpg", date: "February 1964" },
              { src: "/images/covers/196506-OFC.jpg", date: "June 1965" },
              { src: "/images/covers/198706-OFC.jpg", date: "June 1987" },
              { src: "/images/covers/199302-OFC.jpg", date: "February 1993" },
              { src: "/images/covers/200104-OFC.jpg", date: "April 2001" },
              { src: "/images/covers/200311-OFC.jpg", date: "November 2003" },
              { src: "/images/covers/200701-OFC.jpg", date: "January 2007" },
              { src: "/images/covers/202208-OFC.jpg", date: "August 2022" },
            ].map((cover) => (
              <figure key={cover.src}>
                <Image
                  src={cover.src}
                  alt={`The Bridge World cover, ${cover.date}`}
                  width={200}
                  height={280}
                  className="w-full rounded-lg shadow-md border border-stone-200"
                />
                <figcaption className="text-sm text-gray-500 mt-2 text-center">
                  {cover.date}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </div>
    </main>
      <Footer />
    </>
  );
}
